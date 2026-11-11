// The actions Jarvis (Claude) can take, and the code that runs them.
//
// Safety rule: anything that makes the house LESS secure (unlocking a door,
// opening the garage, disarming the alarm) is never executed by the model.
// It becomes a "pending action" that the owner must approve in the app with
// their PIN. Making the house MORE secure (locking, arming) runs immediately.

import { randomUUID } from "node:crypto";
import { assertEntityId, SUPPORTED_DOMAINS } from "./devices.js";

const PENDING_TTL_MS = 2 * 60 * 1000;

export const tools = [
  {
    name: "list_devices",
    description:
      "List the smart-home devices and their current state. Call this before acting if you are not sure of a device's entity_id, or to answer questions like 'is the back door locked?'.",
    input_schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: SUPPORTED_DOMAINS,
          description: "Only list devices of this type. Omit to list everything.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_light",
    description: "Turn lights or plain switches (e.g. a coffee maker plug) on or off, optionally setting brightness.",
    input_schema: {
      type: "object",
      properties: {
        entity_ids: {
          type: "array",
          items: { type: "string" },
          description: "light.* or switch.* entity_ids",
        },
        on: { type: "boolean" },
        brightness_pct: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Lights only, when turning on.",
        },
      },
      required: ["entity_ids", "on"],
      additionalProperties: false,
    },
  },
  {
    name: "lock_doors",
    description: "Lock one or more doors. Runs immediately.",
    input_schema: {
      type: "object",
      properties: { entity_ids: { type: "array", items: { type: "string" } } },
      required: ["entity_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "request_unlock_door",
    description:
      "Ask to unlock a door. This does NOT unlock it: the owner must approve with their PIN in the app. Tell the user it is waiting for their confirmation.",
    input_schema: {
      type: "object",
      properties: { entity_id: { type: "string" } },
      required: ["entity_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_garage",
    description:
      "Open or close a garage door / cover. Closing runs immediately; opening needs the owner's PIN confirmation in the app.",
    input_schema: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        open: { type: "boolean" },
      },
      required: ["entity_id", "open"],
      additionalProperties: false,
    },
  },
  {
    name: "set_security",
    description:
      "Arm or disarm the security system. Arming runs immediately; disarming needs the owner's PIN confirmation in the app.",
    input_schema: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        mode: { type: "string", enum: ["arm_home", "arm_away", "arm_night", "disarm"] },
      },
      required: ["entity_id", "mode"],
      additionalProperties: false,
    },
  },
  {
    name: "set_thermostat",
    description: "Set the target temperature and/or mode of a thermostat.",
    input_schema: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        temperature: { type: "number", minimum: 45, maximum: 90 },
        hvac_mode: { type: "string", enum: ["heat", "cool", "heat_cool", "auto", "off"] },
      },
      required: ["entity_id"],
      additionalProperties: false,
    },
  },
  {
    name: "view_camera",
    description:
      "Take a snapshot from a security camera and look at it, e.g. to answer 'is anyone at the front door?'. The snapshot is also shown to the user.",
    input_schema: {
      type: "object",
      properties: { entity_id: { type: "string" } },
      required: ["entity_id"],
      additionalProperties: false,
    },
  },
];

export class ToolExecutor {
  constructor(backend, log) {
    this.backend = backend;
    this.log = log;
    this.pending = new Map(); // id -> { description, run, expires }
  }

  // Returns { content, events } where content goes back to Claude and
  // events go to the UI (pending confirmations, camera snapshots).
  async run(name, input) {
    const events = [];
    const b = this.backend;
    const ok = (text) => ({ content: text, events });

    switch (name) {
      case "list_devices": {
        const devices = await b.listDevices(input.domain);
        return ok(JSON.stringify(devices));
      }
      case "set_light": {
        const byDomain = {};
        for (const id of input.entity_ids) {
          const domain = id.split(".")[0];
          if (domain !== "light" && domain !== "switch") throw new Error(`${id} is not a light or switch`);
          assertEntityId(id, domain);
          (byDomain[domain] ??= []).push(id);
        }
        for (const [domain, ids] of Object.entries(byDomain)) {
          const data = { entity_id: ids };
          if (domain === "light" && input.on && input.brightness_pct) data.brightness_pct = input.brightness_pct;
          await b.callService(domain, input.on ? "turn_on" : "turn_off", data);
        }
        this.log(`${input.on ? "On" : "Off"}: ${input.entity_ids.join(", ")}`);
        return ok(`Done: turned ${input.on ? "on" : "off"} ${input.entity_ids.join(", ")}`);
      }
      case "lock_doors": {
        input.entity_ids.forEach((id) => assertEntityId(id, "lock"));
        await b.callService("lock", "lock", { entity_id: input.entity_ids });
        this.log(`Locked: ${input.entity_ids.join(", ")}`);
        return ok(`Locked ${input.entity_ids.join(", ")}`);
      }
      case "request_unlock_door": {
        assertEntityId(input.entity_id, "lock");
        return this.#needsConfirmation(events, `Unlock ${input.entity_id}`, () =>
          b.callService("lock", "unlock", { entity_id: input.entity_id }),
        );
      }
      case "set_garage": {
        assertEntityId(input.entity_id, "cover");
        if (input.open) {
          return this.#needsConfirmation(events, `Open ${input.entity_id}`, () =>
            b.callService("cover", "open_cover", { entity_id: input.entity_id }),
          );
        }
        await b.callService("cover", "close_cover", { entity_id: input.entity_id });
        this.log(`Closed: ${input.entity_id}`);
        return ok(`Closing ${input.entity_id}`);
      }
      case "set_security": {
        assertEntityId(input.entity_id, "alarm_control_panel");
        const code = process.env.ALARM_CODE ? { code: process.env.ALARM_CODE } : {};
        const data = { entity_id: input.entity_id, ...code };
        if (input.mode === "disarm") {
          return this.#needsConfirmation(events, `Disarm ${input.entity_id}`, () =>
            b.callService("alarm_control_panel", "alarm_disarm", data),
          );
        }
        await b.callService("alarm_control_panel", `alarm_${input.mode}`, data);
        this.log(`Security ${input.mode}: ${input.entity_id}`);
        return ok(`Security system set to ${input.mode}`);
      }
      case "set_thermostat": {
        assertEntityId(input.entity_id, "climate");
        if (input.hvac_mode)
          await b.callService("climate", "set_hvac_mode", { entity_id: input.entity_id, hvac_mode: input.hvac_mode });
        if (input.temperature !== undefined)
          await b.callService("climate", "set_temperature", { entity_id: input.entity_id, temperature: input.temperature });
        this.log(`Thermostat ${input.entity_id}: ${JSON.stringify(input)}`);
        return ok(`Thermostat updated`);
      }
      case "view_camera": {
        assertEntityId(input.entity_id, "camera");
        const snap = await b.getCameraSnapshot(input.entity_id);
        if (!snap) return ok("This camera has no live image (simulated house). Say so plainly.");
        events.push({ type: "snapshot", entity_id: input.entity_id, mediaType: snap.mediaType, base64: snap.base64 });
        return {
          events,
          content: [
            { type: "image", source: { type: "base64", media_type: snap.mediaType, data: snap.base64 } },
            { type: "text", text: `Snapshot from ${input.entity_id}. Describe what you see briefly.` },
          ],
        };
      }
      default:
        throw new Error(`Unknown tool ${name}`);
    }
  }

  #needsConfirmation(events, description, run) {
    this.#prune();
    const id = randomUUID();
    this.pending.set(id, { description, run, expires: Date.now() + PENDING_TTL_MS });
    events.push({ type: "confirm", id, description });
    this.log(`Waiting for PIN: ${description}`);
    return {
      events,
      content: `NOT done yet. "${description}" is waiting for the owner to confirm with their PIN in the app (expires in 2 minutes). Tell the user to confirm on screen.`,
    };
  }

  #prune() {
    const now = Date.now();
    for (const [id, p] of this.pending) if (p.expires < now) this.pending.delete(id);
  }

  async confirm(id) {
    this.#prune();
    const p = this.pending.get(id);
    if (!p) throw new Error("That request expired or was already handled. Ask Jarvis again.");
    this.pending.delete(id);
    await p.run();
    this.log(`Confirmed with PIN: ${p.description}`);
    return p.description;
  }

  cancel(id) {
    const p = this.pending.get(id);
    this.pending.delete(id);
    if (p) this.log(`Cancelled: ${p.description}`);
  }
}
