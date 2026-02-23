// Must be first: register Node.js platform (crypto, storage, network)
import "@matter/main/platform";

import { Environment, ServerNode, Endpoint, VendorId } from "@matter/main";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { OnOffPlugInUnitDevice } from "@matter/main/devices/on-off-plug-in-unit";
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { readFileSync } from "node:fs";

// Suprime o WARN "triggerEffect: Throws unimplemented exception" em cada device
class QuietIdentifyServer extends IdentifyServer {
    async triggerEffect() {}
}
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const devices = JSON.parse(readFileSync(join(__dirname, "devices.json"), "utf8"));

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

async function main() {
    // Persist commissioning data across restarts
    Environment.default.vars.set("path.root", "/data");

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
        console.log("QR Code string (cole em https://project-chip.github.io/connectedhomeip/qrcode.html):");
        console.log(qrPairingCode);
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
