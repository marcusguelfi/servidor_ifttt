// Must be first: register Node.js platform (crypto, storage, network)
import "@matter/main/platform";

import { Environment, ServerNode, Endpoint, VendorId } from "@matter/main";
import { AggregatorEndpoint }              from "@matter/main/endpoints/aggregator";
import { OnOffPlugInUnitDevice }           from "@matter/main/devices/on-off-plug-in-unit";
import { DimmableLightDevice }             from "@matter/main/devices/dimmable-light";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { IdentifyServer }                  from "@matter/main/behaviors/identify";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath }                   from "node:url";
import { dirname, join }                   from "node:path";
import { createServer }                    from "node:http";
import { execSync }                        from "node:child_process";
import qrcode                              from "qrcode-terminal";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SERVER_URL  = process.env.SERVER_URL  || "http://localhost:3000";
const DEFAULT_MAC = process.env.DEFAULT_MAC || "";
const MGMT_PORT   = parseInt(process.env.MGMT_PORT   || "5541", 10);
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || "5540", 10);
const BRIDGE_ID   = process.env.BRIDGE_ID || "pc-matter-bridge";

// devices.json agora é uma lista de ações (template por PC)
const deviceTemplate = JSON.parse(readFileSync(join(__dirname, "devices.json"), "utf8"));

// Caches em disco
const PC_CACHE_PATH    = "/data/pc-cache.json";
const AUDIO_CACHE_PATH = "/data/audio-devices-cache.json";

const WAIT_TIMEOUT_MS  = 45_000;
const POLL_INTERVAL_MS = 3_000;

class QuietIdentifyServer extends IdentifyServer {
    async triggerEffect() {}
}

let pairingCodes = null;
let matterServer = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function shortenHostname(hostname) {
    return hostname
        .replace(/^DESKTOP-/i, '')
        .replace(/^LAPTOP-/i,  '')
        .replace(/-PC$/i,      '')
        .replace(/_PC$/i,      '')
        .substring(0, 10)
        .toUpperCase();
}

function loadJson(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")); } catch (_) {}
    return null;
}

function saveJson(path, data) {
    try { writeFileSync(path, JSON.stringify(data, null, 2)); } catch (_) {}
}

async function pollUntil(url, validator, label) {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    let attempt = 0;
    while (Date.now() < deadline) {
        attempt++;
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (validator(data)) return data;
            }
        } catch (_) {}
        const remaining = Math.round((deadline - Date.now()) / 1000);
        if (remaining > 0) {
            console.log(`[Bridge] Aguardando ${label}... (${remaining}s, tentativa ${attempt})`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
    }
    return null;
}

// ── Chamar API do servidor ─────────────────────────────────────────────────

async function callApi(command, params = {}, macAddress = DEFAULT_MAC) {
    const url = macAddress
        ? `${SERVER_URL}/api/webhook/${macAddress}/${command}`
        : `${SERVER_URL}/api/command/${command}`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });
        console.log(`[API] ${command} → ${macAddress || "default"}: HTTP ${res.status}`);
    } catch (err) {
        console.error(`[API] Erro: ${err.message}`);
    }
}

// ── Carregar PCs conectados (com cache) ────────────────────────────────────

async function loadConnectedPCs() {
    const live = await pollUntil(
        `${SERVER_URL}/api/pcs`,
        data => Array.isArray(data) && data.length > 0,
        "PCs conectarem"
    );
    if (live) {
        let pcs = live.filter(p => p.online);
        // Se DEFAULT_MAC definido → só o PC deste bridge
        if (DEFAULT_MAC) {
            pcs = pcs.filter(p => p.macAddress === DEFAULT_MAC);
            if (pcs.length === 0) {
                console.warn(`[Bridge] PC com MAC ${DEFAULT_MAC} não está online. Aguardando cache...`);
            }
        }
        if (pcs.length > 0) {
            console.log(`[Bridge] PCs deste bridge: ${pcs.map(p => p.hostname).join(', ')}`);
            saveJson(PC_CACHE_PATH, pcs);
            return pcs;
        }
    }
    const cached = loadJson(PC_CACHE_PATH);
    if (cached && cached.length > 0) {
        console.warn(`[Bridge] Timeout. Usando ${cached.length} PC(s) em cache.`);
        return cached;
    }
    console.warn("[Bridge] Nenhum PC disponível para este bridge.");
    return [];
}

// ── Gerar devices por PC (template × PCs) ─────────────────────────────────

function buildPCDevices(pcs) {
    const devices = [];
    for (const pc of pcs) {
        const prefix = shortenHostname(pc.hostname);
        for (const t of deviceTemplate) {
            devices.push({
                name:       `${prefix} ${t.action}`.substring(0, 32),
                command:    t.command,
                type:       t.type,
                params:     t.params || {},
                macAddress: pc.macAddress,
            });
        }
        console.log(`[Bridge] ${pcs.indexOf(pc) + 1}. ${pc.hostname} (${pc.macAddress}) → ${deviceTemplate.length} devices`);
    }
    return devices;
}

// ── Áudio devices (do PC padrão, com cache) ───────────────────────────────

async function loadAudioDevices() {
    const live = await pollUntil(
        `${SERVER_URL}/api/audio-devices`,
        data => Array.isArray(data) && data.length > 0,
        "áudio devices"
    );
    if (live) {
        const entries = live.map(d => ({
            name:    d.name.substring(0, 32),
            command: "set-audio-device",
            params:  { device: d.name },
            macAddress: DEFAULT_MAC,
        }));
        saveJson(AUDIO_CACHE_PATH, entries);
        return entries;
    }
    const cached = loadJson(AUDIO_CACHE_PATH);
    if (cached) { console.warn(`[Bridge] Áudio: usando ${cached.length} device(s) em cache.`); return cached; }
    return [];
}

// ── Custom commands (globais, sem prefix de PC) ────────────────────────────

async function loadCustomCommands() {
    try {
        const res = await fetch(`${SERVER_URL}/api/custom-commands`);
        if (res.ok) {
            const data = await res.json();
            const cmds = (data.commands || []).map(c => ({
                name:    c.label.substring(0, 32),
                command: c.command,
                params:  c.params || {},
                macAddress: DEFAULT_MAC,
            }));
            if (cmds.length > 0) console.log(`[Bridge] Custom commands: ${cmds.map(c => c.name).join(', ')}`);
            return cmds;
        }
    } catch (_) {}
    return [];
}

// ── Management HTTP ────────────────────────────────────────────────────────

const mgmtServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/status") {
        res.end(JSON.stringify({
            commissioned: matterServer?.lifecycle?.isCommissioned ?? false,
            qrCode:       pairingCodes?.qrPairingCode    ?? null,
            manualCode:   pairingCodes?.manualPairingCode ?? null,
        }));
    } else if (req.method === "POST" && req.url === "/reset") {
        try {
            execSync("rm -rf /data/*");
            res.end(JSON.stringify({ success: true, message: "Commissioning resetado. Reiniciando..." }));
            setTimeout(() => process.exit(0), 500);
        } catch (e) {
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
    } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
    }
});

mgmtServer.listen(MGMT_PORT, () => console.log(`[Bridge] Management HTTP em :${MGMT_PORT}`));

// ── Registrar endpoint Matter ─────────────────────────────────────────────

async function registerDevice(aggregator, device, index) {
    const id       = `device-${index}`;
    const mac      = device.macAddress || DEFAULT_MAC;
    const nodeLabel = device.name; // já truncado em 32

    if (device.type === "dimmer") {
        const ep = new Endpoint(
            DimmableLightDevice.with(BridgedDeviceBasicInformationServer, QuietIdentifyServer),
            {
                id,
                bridgedDeviceBasicInformation: { nodeLabel, reachable: true, uniqueId: `${id}-u` },
                onOff:        { onOff: true },
                levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
            }
        );
        await aggregator.add(ep);
        ep.events.levelControl.currentLevel$Changed.on(async (level) => {
            const volume = Math.round(((level ?? 127) / 254) * 100);
            await callApi("set-volume", { volume }, mac);
        });
    } else {
        const ep = new Endpoint(
            OnOffPlugInUnitDevice.with(BridgedDeviceBasicInformationServer, QuietIdentifyServer),
            { id, bridgedDeviceBasicInformation: { nodeLabel, reachable: true, uniqueId: `${id}-u` }, onOff: { onOff: false } }
        );
        await aggregator.add(ep);
        ep.events.onOff.onOff$Changed.on(async (value) => {
            if (value) {
                await callApi(device.command, device.params ?? {}, mac);
                setTimeout(async () => {
                    try { await ep.set({ onOff: { onOff: false } }); } catch (_) {}
                }, 1500);
            }
        });
    }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    Environment.default.vars.set("path.root", "/data");

    // Carregar todos os devices em paralelo
    console.log("[Bridge] Carregando devices...");
    const [pcs, audioDevices, customDevices] = await Promise.all([
        loadConnectedPCs(),
        loadAudioDevices(),
        loadCustomCommands(),
    ]);

    const pcDevices     = buildPCDevices(pcs);
    const allDevices    = [...pcDevices, ...audioDevices, ...customDevices];
    console.log(`[Bridge] Total de devices: ${allDevices.length} (${pcDevices.length} PC + ${audioDevices.length} áudio + ${customDevices.length} custom)`);

    matterServer = await ServerNode.create({
        id: BRIDGE_ID,
        network: { port: BRIDGE_PORT },
        commissioning: { passcode: 20202021, discriminator: 3840 },
        productDescription: { name: "PC Bridge", deviceType: AggregatorEndpoint.deviceType },
        basicInformation: {
            vendorName: "PC Control", vendorId: VendorId(0xfff1),
            nodeLabel: BRIDGE_ID.substring(0, 32),
            productName: "PC Matter Bridge", productLabel: "PC Matter Bridge",
            productId: 0x8000,
            serialNumber: BRIDGE_ID.substring(0, 32),
            uniqueId:     BRIDGE_ID.substring(0, 32),
        },
    });

    const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
    await matterServer.add(aggregator);

    for (const [index, device] of allDevices.entries()) {
        await registerDevice(aggregator, device, index);
    }

    await matterServer.start();

    if (!matterServer.lifecycle.isCommissioned) {
        pairingCodes = matterServer.state.commissioning.pairingCodes;
        const { qrPairingCode, manualPairingCode } = pairingCodes;
        console.log("\n╔══════════════════════════════════════════════════╗");
        console.log("║         MATTER BRIDGE — PRONTO PARA PAREAR       ║");
        console.log("╚══════════════════════════════════════════════════╝\n");
        if (qrPairingCode) {
            qrcode.generate(qrPairingCode, { small: true });
            console.log("QR Code string:", qrPairingCode);
        }
        console.log(`Código manual: ${manualPairingCode}`);
        console.log("App Alexa: Dispositivos → '+' → Adicionar → Matter → Escanear QR");
        console.log("Ou acesse: http://<servidor>:3000/api/matter/status");
    } else {
        console.log("[Bridge] Já comissionado. Dispositivos disponíveis na Alexa.");
    }
}

main().catch(err => { console.error("[Bridge] Fatal:", err); process.exit(1); });
