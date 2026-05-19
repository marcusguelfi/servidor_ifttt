// Must be first: register Node.js platform (crypto, storage, network)
import "@matter/main/platform";

import { Environment, ServerNode, Endpoint, VendorId } from "@matter/main";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { OnOffPlugInUnitDevice } from "@matter/main/devices/on-off-plug-in-unit";
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import qrcode from "qrcode-terminal";

class QuietIdentifyServer extends IdentifyServer {
    async triggerEffect() {}
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const AUDIO_CACHE_PATH = "/data/audio-devices-cache.json";
const AUDIO_WAIT_TIMEOUT_MS = 60_000;  // espera até 60s pelo PC conectar
const AUDIO_POLL_INTERVAL_MS = 3_000;

const staticDevices = JSON.parse(readFileSync(join(__dirname, "devices.json"), "utf8"));

async function callApi(command, params = {}) {
    const url = `${SERVER_URL}/api/command/${command}`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });
        console.log(`[API] ${command}: HTTP ${res.status}`);
    } catch (err) {
        console.error(`[API] Error calling ${command}: ${err.message}`);
    }
}

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

// Tenta buscar audio devices do servidor.
// Aguarda até AUDIO_WAIT_TIMEOUT_MS pelo PC client conectar, fazendo polling.
// Se o tempo esgotar, usa o cache em disco da última execução.
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
                    console.log(`[Bridge] Áudio devices detectados (tentativa ${attempt}): ${audioDevs.map(d => d.name).join(", ")}`);
                    const entries = audioDevs.map(d => ({
                        name: d.name.length > 50 ? d.name.substring(0, 50) : d.name,
                        command: "set-audio-device",
                        params: { device: d.name },
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

    // Timeout: tenta usar cache do disco
    const cached = loadCachedAudioDevices();
    if (cached) {
        console.warn(`[Bridge] Timeout aguardando PC. Usando ${cached.length} device(s) em cache.`);
        return cached;
    }

    console.warn("[Bridge] Nenhum áudio device disponível. Iniciando sem devices de áudio.");
    return [];
}

async function main() {
    Environment.default.vars.set("path.root", "/data");

    const audioDeviceEntries = await loadAudioDevices();
    const devices = [...staticDevices, ...audioDeviceEntries];

    const server = await ServerNode.create({
        id: "pc-matter-bridge",
        network: { port: 5540 },
        commissioning: {
            passcode: 20202021,
            discriminator: 3840,
        },
        productDescription: {
            name: "PC Bridge",
            deviceType: AggregatorEndpoint.deviceType,
        },
        basicInformation: {
            vendorName: "PC Control",
            vendorId: VendorId(0xfff1),
            nodeLabel: "PC Matter Bridge",
            productName: "PC Matter Bridge",
            productLabel: "PC Matter Bridge",
            productId: 0x8000,
            serialNumber: "pc-bridge-001",
            uniqueId: "pc-matter-bridge-001",
        },
    });

    const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
    await server.add(aggregator);

    for (const [index, device] of devices.entries()) {
        const id = `device-${index}`;

        if (device.type === "dimmer") {
            const ep = new Endpoint(DimmableLightDevice.with(BridgedDeviceBasicInformationServer, QuietIdentifyServer), {
                id,
                bridgedDeviceBasicInformation: {
                    nodeLabel: device.name,
                    reachable: true,
                    uniqueId: `${id}-unique`,
                },
                onOff: { onOff: true },
                levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
            });
            await aggregator.add(ep);

            ep.events.levelControl.currentLevel$Changed.on(async (level) => {
                const volume = Math.round(((level ?? 127) / 254) * 100);
                console.log(`[${device.name}] level ${level} → volume ${volume}%`);
                await callApi("set-volume", { volume });
            });
        } else {
            const ep = new Endpoint(OnOffPlugInUnitDevice.with(BridgedDeviceBasicInformationServer, QuietIdentifyServer), {
                id,
                bridgedDeviceBasicInformation: {
                    nodeLabel: device.name,
                    reachable: true,
                    uniqueId: `${id}-unique`,
                },
                onOff: { onOff: false },
            });
            await aggregator.add(ep);

            ep.events.onOff.onOff$Changed.on(async (value) => {
                console.log(`[${device.name}] ${value ? "ON → acionando" : "OFF"}`);
                if (value) {
                    await callApi(device.command, device.params ?? {});
                    // Auto-reset: volta para OFF após 1.5s para permitir re-acionamento
                    setTimeout(async () => {
                        try {
                            await ep.set({ onOff: { onOff: false } });
                            console.log(`[${device.name}] reset → OFF`);
                        } catch (err) {
                            console.error(`[${device.name}] Erro no reset: ${err.message}`);
                        }
                    }, 1500);
                }
            });
        }

        console.log(`[Bridge] Registered: ${device.name} (${device.type ?? "switch"})`);
    }

    await server.start();

    if (!server.lifecycle.isCommissioned) {
        const { qrPairingCode, manualPairingCode } =
            server.state.commissioning.pairingCodes;
        console.log("");
        console.log("╔═══════════════════════════════════════════════════╗");
        console.log("║          MATTER BRIDGE — PRONTO PARA PAREAR       ║");
        console.log("╚═══════════════════════════════════════════════════╝");
        console.log("");

        if (qrPairingCode) {
            console.log("▼ Escaneie o QR Code abaixo com o app Alexa/Google Home:");
            qrcode.generate(qrPairingCode, { small: true });
            console.log("QR Code string:", qrPairingCode);
            console.log("(ou cole em: https://project-chip.github.io/connectedhomeip/qrcode.html)");
        } else {
            console.log("[AVISO] qrPairingCode não disponível. Tente reiniciar o bridge.");
        }

        console.log("");
        console.log(`Código manual: ${manualPairingCode}`);
        console.log("");
        console.log("No app Alexa: Dispositivos → '+' → Adicionar → Matter → Escanear QR");
        console.log("──────────────────────────────────────────────────────");
    } else {
        console.log("[Bridge] Já comissionado. Dispositivos disponíveis na Alexa.");
    }
}

main().catch((err) => {
    console.error("[Bridge] Fatal error:", err);
    process.exit(1);
});
