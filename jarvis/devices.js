// Device layer. Two backends with the same interface:
//  - HomeAssistantBackend: talks to a real Home Assistant over its REST API
//  - SimulatedBackend: a pretend house so you can try Jarvis without hardware
//
// Interface:
//   listDevices(domain?)            -> [{ entity_id, name, domain, state, attributes }]
//   callService(domain, service, data) -> void
//   getCameraSnapshot(entity_id)    -> { mediaType, base64 } | null

export const SUPPORTED_DOMAINS = [
  "light",
  "switch",
  "lock",
  "camera",
  "climate",
  "alarm_control_panel",
  "cover",
  "fan",
  "media_player",
];

const ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;

export function assertEntityId(entityId, expectedDomain) {
  if (typeof entityId !== "string" || !ENTITY_ID_RE.test(entityId)) {
    throw new Error(`Invalid entity_id "${entityId}"`);
  }
  if (expectedDomain && !entityId.startsWith(`${expectedDomain}.`)) {
    throw new Error(`"${entityId}" is not a ${expectedDomain} device`);
  }
}

function summarize(s) {
  return {
    entity_id: s.entity_id,
    name: s.attributes?.friendly_name ?? s.entity_id,
    domain: s.entity_id.split(".")[0],
    state: s.state,
    attributes: pickAttributes(s.attributes ?? {}),
  };
}

// Keep the attributes the model actually needs; HA sends a lot of noise.
function pickAttributes(a) {
  const keep = [
    "brightness",
    "current_temperature",
    "temperature",
    "hvac_mode",
    "current_position",
    "percentage",
    "media_title",
    "volume_level",
  ];
  const out = {};
  for (const k of keep) if (a[k] !== undefined) out[k] = a[k];
  if (out.brightness !== undefined) {
    out.brightness_pct = Math.round((out.brightness / 255) * 100);
    delete out.brightness;
  }
  return out;
}

export class HomeAssistantBackend {
  constructor(url, token) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
    this.name = "Home Assistant";
  }

  async #request(path, init = {}) {
    const res = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Home Assistant ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  }

  async listDevices(domain) {
    const res = await this.#request("/api/states");
    const states = await res.json();
    return states
      .filter((s) => {
        const d = s.entity_id.split(".")[0];
        return domain ? d === domain : SUPPORTED_DOMAINS.includes(d);
      })
      .map(summarize);
  }

  async callService(domain, service, data) {
    await this.#request(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCameraSnapshot(entityId) {
    assertEntityId(entityId, "camera");
    const res = await this.#request(`/api/camera_proxy/${entityId}`);
    const mediaType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    const buf = Buffer.from(await res.arrayBuffer());
    return { mediaType, base64: buf.toString("base64") };
  }
}

export class SimulatedBackend {
  constructor() {
    this.name = "Simulated house";
    const s = (entity_id, friendly_name, state, attributes = {}) => ({
      entity_id,
      state,
      attributes: { friendly_name, ...attributes },
    });
    this.states = new Map(
      [
        s("light.living_room", "Living Room Lights", "on", { brightness: 200 }),
        s("light.kitchen", "Kitchen Lights", "off"),
        s("light.bedroom", "Bedroom Lights", "off"),
        s("light.porch", "Porch Light", "off"),
        s("switch.coffee_maker", "Coffee Maker", "off"),
        s("lock.front_door", "Front Door", "locked"),
        s("lock.back_door", "Back Door", "unlocked"),
        s("lock.garage_door", "Garage Side Door", "locked"),
        s("cover.garage", "Garage Door", "closed", { current_position: 0 }),
        s("camera.front_door", "Front Door Camera", "idle"),
        s("camera.backyard", "Backyard Camera", "idle"),
        s("climate.thermostat", "Thermostat", "heat", {
          current_temperature: 68,
          temperature: 70,
          hvac_mode: "heat",
        }),
        s("alarm_control_panel.home", "Home Security", "disarmed"),
        s("media_player.living_room_speaker", "Living Room Speaker", "idle", {
          volume_level: 0.3,
        }),
      ].map((x) => [x.entity_id, x]),
    );
  }

  async listDevices(domain) {
    return [...this.states.values()]
      .filter((s) => !domain || s.entity_id.startsWith(`${domain}.`))
      .map(summarize);
  }

  async callService(domain, service, data) {
    const ids = [].concat(data.entity_id ?? []);
    for (const id of ids) {
      const dev = this.states.get(id);
      if (!dev) throw new Error(`No device named ${id}`);
      const a = dev.attributes;
      switch (`${domain}.${service}`) {
        case "light.turn_on":
          dev.state = "on";
          if (data.brightness_pct !== undefined)
            a.brightness = Math.round((data.brightness_pct / 100) * 255);
          else a.brightness ??= 255;
          break;
        case "light.turn_off":
        case "switch.turn_off":
        case "fan.turn_off":
          dev.state = "off";
          break;
        case "switch.turn_on":
        case "fan.turn_on":
          dev.state = "on";
          break;
        case "lock.lock":
          dev.state = "locked";
          break;
        case "lock.unlock":
          dev.state = "unlocked";
          break;
        case "cover.open_cover":
          dev.state = "open";
          a.current_position = 100;
          break;
        case "cover.close_cover":
          dev.state = "closed";
          a.current_position = 0;
          break;
        case "climate.set_temperature":
          a.temperature = data.temperature;
          break;
        case "climate.set_hvac_mode":
          dev.state = data.hvac_mode;
          a.hvac_mode = data.hvac_mode;
          break;
        case "alarm_control_panel.alarm_arm_home":
          dev.state = "armed_home";
          break;
        case "alarm_control_panel.alarm_arm_away":
          dev.state = "armed_away";
          break;
        case "alarm_control_panel.alarm_arm_night":
          dev.state = "armed_night";
          break;
        case "alarm_control_panel.alarm_disarm":
          dev.state = "disarmed";
          break;
        default:
          throw new Error(`Simulator does not support ${domain}.${service}`);
      }
    }
  }

  async getCameraSnapshot() {
    return null; // no real camera in the simulator
  }
}

export function createBackend() {
  const { HA_URL, HA_TOKEN } = process.env;
  if (HA_URL && HA_TOKEN) return new HomeAssistantBackend(HA_URL, HA_TOKEN);
  return new SimulatedBackend();
}
