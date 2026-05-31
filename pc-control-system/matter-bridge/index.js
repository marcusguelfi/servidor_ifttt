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
const MGMT_PORT   = parseInt(process.env.MGMT_PORT || "5541", 10);

const AUDIO_CACHE_PATH       = "/data/audio-devices-cache.json";
const AUDIO_WAIT_TIMEOUT_MS  = 60_000;
const AUDIO_POLL_INTERVAL_MS = 3_000;

const staticDevices = JSON.parse(readFileSync(join(__dirname, "devices.json"), "utf8"));

// Suprime WARN "triggerEffect: Throws unimplemented exception"
class QuietIdentifyServer extends IdentifyServer {
    async triggerEffect() {}
}

// Estado global do commissioning (preenchido após server.start)
let pairingCodes = null;
let matterServer = null;

// ── Chamar API do servidor principal ──────────────────────────────────────
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
        console.error(`[API] Erro em ${command}: ${err.message}`);
    }
}

// ── Discovery dinâmico de dispositivos de áudio ────────────────────────────
function loadCachedAudioDevices() {
    try {
        if (existsSync(AUDIO_CACHE_PATH)) {
            const cached = JSON.parse(readFileSync(AUDIO_CACHE_PATH, "utf8"));
            if (Array.isArray(cached) && cached.length > 0) return cached;
        }
    } catch (_) {}
    return null;
}

function saveCachedAudioDevices(devices) {
    try {
        writeFileSync(AUDIO_CACHE_PATH, JSON.stringify(devices, null, 2), "utf8");
    } catch (err) {
        console.warn(`[Bridge] Não foi possível salvar cache de áudio: ${err.message}`);
    }
}

async function loadAudioDevices() {
    const deadline = Date.now() + AUDIO_WAIT_TIMEOUT_MS;
    let attempt = 0;
    while (Date.now() < deadline) {
        attempt++;
        try {
            const res = await fetch(`${SERVER_URL}/api/audio-devices`);
            if (res.ok) {
                const audioDevs = await res.json();
                if (Array.isArray(audioDevs) && audioDevs.length > 0) {
                    console.log(`[Bridge] Áudio devices (tentativa ${attempt}): ${audioDevs.map(d => d.name).join(", ")}`);
                    const entries = audioDevs.map(d => ({
                        name:    d.name.length > 50 ? d.name.substring(0, 50) : d.name,
                        command: "set-audio-device",
                        params:  { device: d.name },
                    }));
                    saveCachedAudioDevices(entries);
                    return entries;
                }
            }
        } catch (_) {}
        const remaining = Math.round((deadline - Date.now()) / 1000);
        if (remaining > 0) {
            console.log(`[Bridge] PC client ainda não conectou — aguardando... (${remaining}s restantes)`);
            await new Promise(r => setTimeout(r, AUDIO_POLL_INTERVAL_MS));
        }
    }
    const cached = loadCachedAudioDevices();
    if (cached) {
        console.warn(`[Bridge] Timeout. Usando ${cached.length} device(s) em cache.`);
        return cached;
    }
    console.warn("[Bridge] Nenhum áudio device disponível. Iniciando sem devices de áudio.");
    return [];
}

// ── Management HTTP (QR code + reset para Alexa) ──────────────────────────
const mgmtServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/status") {
        const commissioned = matterServer?.lifecycle?.isCommissioned ?? false;
        res.end(JSON.stringify({
            commissioned,
            qrCode:     pairingCodes?.qrPairingCode     ?? null,
            manualCode: pairingCodes?.manualPairingCode  ?? null,
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

mgmtServer.listen(MGMT_PORT, () => {
    console.log(`[Bridge] Management HTTP em :${MGMT_PORT}`);
});

// ── Matter Bridge principal ────────────────────────────────────────────────
async function main() {
    Environment.default.vars.set("path.root", "/data");

    const audioDeviceEntries = await loadAudioDevices();
    const devices = [...staticDevices, ...audioDeviceEntries];

    matterServer = await ServerNode.create({
        id: "pc-matter-bridge",
        network: { port: 5540 },
        commissioning: {
            passcode:      20202021,
            discriminator: 3840,
        },
        productDescription: {
            name:       "PC Bridge",
            deviceType: AggregatorEndpoint.deviceType,
        },
        basicInformation: {
            vendorName:    "PC Control",
            vendorId:      VendorId(0xfff1),
            nodeLabel:     "PC Matter Bridge",
            productName:   "PC Matter Bridge",
            productLabel:  "PC Matter Bridge",
            productId:     0x8000,
            serialNumber:  "pc-bridge-001",
            uniqueId:      "pc-matter-bridge-001",
        },
    });

    const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
    await matterServer.add(aggregator);

    for (const [index, device] of devices.entries()) {
        const id  = `device-${index}`;
        const mac = device.macAddress || DEFAULT_MAC;

        if (device.type === "dimmer") {
            const ep = new Endpoint(
                DimmableLightDevice.with(BridgedDeviceBasicInformationServer, QuietIdentifyServer),
                {
                    id,
                    bridgedDeviceBasicInformation: { nodeLabel: device.name, reachable: true, uniqueId: `${id}-u` },
                    onOff:        { onOff: true },
                    levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
                }
            );
            await aggregator.add(ep);
            ep.events.levelControl.currentLevel$Changed.on(async (level) => {
                const volume = Math.round(((level ?? 127) / 254) * 100);
                console.log(`[${device.name}] level ${level} → volume ${volume}%`);
                await callApi("set-volume", { volume }, mac);
            });

        } else {
            const ep = new Endpoint(
                OnOffPlugInUnitDevice.with(BridgedDeviceBasicInformationServer, QuietIdentifyServer),
                {
                    id,
                    bridgedDeviceBasicInformation: { nodeLabel: device.name, reachable: true, uniqueId: `${id}-u` },
                    onOff: { onOff: false },
                }
            );
            await aggregator.add(ep);
            ep.events.onOff.onOff$Changed.on(async (value) => {
                console.log(`[${device.name}] ${value ? "ON → acionando" : "OFF"}`);
                if (value) {
                    await callApi(device.command, device.params ?? {}, mac);
                    setTimeout(async () => {
                        try { await ep.set({ onOff: { onOff: false } }); }
                        catch (e) { console.error(`[${device.name}] reset error: ${e.message}`); }
                    }, 1500);
                }
            });
        }
        console.log(`[Bridge] Registrado: ${device.name} (${device.type ?? "switch"}) → MAC: ${mac || "default"}`);
    }

    await matterServer.start();

    if (!matterServer.lifecycle.isCommissioned) {
        pairingCodes = matterServer.state.commissioning.pairingCodes;
        const { qrPairingCode, manualPairingCode } = pairingCodes;
        console.log("");
        console.log("╔══════════════════════════════════════════════════╗");
        console.log("║         MATTER BRIDGE — PRONTO PARA PAREAR       ║");
        console.log("╚══════════════════════════════════════════════════╝");
        console.log("");
        if (qrPairingCode) {
            console.log("▼ Escaneie o QR Code abaixo com o app Alexa:");
            qrcode.generate(qrPairingCode, { small: true });
            console.log("QR Code string:", qrPairingCode);
        }
        console.log(`Código manual: ${manualPairingCode}`);
        console.log("");
        console.log("App Alexa: Dispositivos → '+' → Adicionar → Matter → Escanear QR");
        console.log("Ou acesse: http://<servidor>:3000/api/matter/status");
        console.log("─────────────────────────────────────────────────────");
    } else {
        console.log("[Bridge] Já comissionado. Dispositivos disponíveis na Alexa.");
    }
}

main().catch(err => {
    console.error("[Bridge] Fatal:", err);
    process.exit(1);
});
