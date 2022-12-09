import { execSync } from "child_process";
import { env } from "process";
import * as net from "net";
import EventEmitter from "events";

export const SOCKET_PATH = env.I3SOCK ?? execSync("i3 --get-socketpath", {encoding: "utf-8"});

const MAGIC = Buffer.from("i3-ipc", "utf-8");

let ipcConnected = false;

export function isConnected() { return ipcConnected; }

const registeredEvents: Events[] = [];
const messageQueue: Buffer[] = [];
const handlerQueue: Function[] = [];

export enum MESSAGE_TYPE {
    RUN_COMMAND = 0,
    GET_WORKSPACES = 1,
    SUBSCRIBE = 2,
    GET_OUTPUTS = 3,
    GET_TREE = 4,
    GET_MARKS = 5,
    GET_BAR_CONFIG = 6,
    GET_VERSION = 7,
    GET_BINDING_MODES = 8,
    GET_CONFIG = 9,
    SEND_TICK = 10,
    SYNC = 11,
    GET_BINDING_STATE = 12
};

class IpcEventEmitter extends EventEmitter {
    on(eventName: Events, listener: (...args: any[]) => void): this {
        if(!registeredEvents.includes(eventName)) registerEvents(eventName);
        super.on(eventName, listener);
        return this;
    }
}

export const ipcEvents = new IpcEventEmitter();

ipcEvents.on("shutdown", (event: EVENT_SHUTDOWN) => {
    if(event.data.change == "restart") {
        // try doing reset logic idk I'm slow

        disconnect();
    }
});

let ipcClient: net.Socket;

export function connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if(ipcClient != undefined) {
            ipcClient.connect({
                path: SOCKET_PATH
            });
        } else {
            ipcClient = net.createConnection({
                path: SOCKET_PATH
            });
        }
    
        ipcClient.on("connect", () => {
            ipcConnected = true;
        
            startMessageLoop();

            resolve();
        });
        
        // don't forget to handle events https://i3wm.org/docs/ipc.html#_events
        ipcClient.on("data", (data) => {
            const parsed = parseResponse(data);
            if(isEventReply(parsed.message_type)) {
                parsed.message_type = getEventType(parsed.message_type);
                const eventString = EVENT_NUM_TO_STRING[parsed.message_type];
                ipcEvents.emit(eventString, parsed);
                return;
            }
        
            const handler = handlerQueue.shift();
            if(handler == undefined) return;
            handler(undefined, data);
        });
        
        ipcClient.on("error", (err) => {
            const handler = handlerQueue.shift();
            if(handler == undefined) return;
            handler(err, null);
        });
        
        ipcClient.on("end", () => {
            ipcConnected = false;
        });
        
        ipcClient.on("close", () => {
            ipcConnected = false;
        });
    });
}

export function registerEvents(...events: Events[]) {
    registeredEvents.push(...events);
    return send(MESSAGE_TYPE.SUBSCRIBE, JSON.stringify(events));
}

export function startMessageLoop() {
    if(!ipcConnected) return;
    const u: NodeJS.Timer = setInterval(() => {
        if(!ipcConnected) return clearInterval(u);

        const message = messageQueue.shift();
        if(message == undefined) return;

        ipcClient.write(message, err => {
            if(err) console.error(err);
        });

    }, 10);
}

export function disconnect() {
    ipcClient.end();
}

export function send(type: MESSAGE_TYPE, ...payload: (number | string | Buffer)[]): Promise<Reply> {
    return sendMessage(formatMessage(type, payload));
}

// change this to return something other than a Buffer
export function sendMessage(message: Buffer): Promise<Reply> {
    messageQueue.push(message);
    return new Promise<Reply>((resolve, reject) => {
        handlerQueue.push((err: Error | undefined, buffer: Buffer) => {
            if(err) return reject(err);

            resolve(parseResponse(buffer));
        })
    });
}

export function isEventReply(message_type: number) {
    // check if the highest bit is a 1
    return getEventType(message_type) >= 0;
}

function getEventType(message_type: number) {
    return message_type ^ 0x80000000;
}

export function parseResponse(response: Buffer): Reply {
    if(response.byteLength < MAGIC.byteLength + 8) throw new Error("buffer does not meet minimum length");

    if(!response.subarray(0, MAGIC.byteLength).equals(MAGIC)) throw new Error("buffer does not include i3-ipc");

    const bufferLength = response.subarray(MAGIC.byteLength, MAGIC.byteLength + 4).readUInt32LE();
    const messageType = response.subarray(MAGIC.byteLength + 4, MAGIC.byteLength + 8).readUInt32LE();

    const message = response.subarray(MAGIC.byteLength + 8, MAGIC.byteLength + 8 + bufferLength);

    return {
        data: JSON.parse(message.toString("utf-8")),
        message_type: messageType
    };
}

export function formatMessage(type: MESSAGE_TYPE, payload: (number | string | Buffer)[]) {
    const bytes = [];
    for(const p of payload) {
        if(typeof p == "number") {
            bytes.push(p);
        } else if(typeof p == "string") {
            for(let i = 0; i < p.length; i++) {
                bytes.push(p.charCodeAt(i));
            }
        } else if(p instanceof Buffer) {
            for (const entry of p.entries()) {
                bytes.push(entry[1]);
            }
        }
    }

    const byteBuffer = Buffer.from(bytes);

    // the length of the buffer is the size of the magic string, the length of our array,
    // and 4 bytes for the 32-bit integer length and 4 bytes for the 32-bit integer message type
    const buffer = Buffer.alloc(MAGIC.byteLength + bytes.length + 8);

    MAGIC.copy(buffer);
    buffer.writeInt32LE(byteBuffer.byteLength, MAGIC.byteLength);
    buffer.writeInt32LE(type, MAGIC.byteLength + 4);
    byteBuffer.copy(buffer, MAGIC.byteLength + 8);

    return buffer;
}

export function niceOutput(buffer: Buffer) {
    const group = [];
    const u = buffer.toString("hex");
    for(let i = 0; i < u.length / 2; i++) {
        group.push(u.substring(i * 2, i * 2 + 2));
    }

    console.dir(group);
}

export function checkEndianness() {
    let uInt32 = new Uint32Array([0x11223344]);
    let uInt8 = new Uint8Array(uInt32.buffer);

    return uInt8[0] === 0x44;
}

export type Workspace = {
    id: number;
    num: number;
    name: string;
    visible: boolean;
    focused: boolean;
    urgent: boolean;
    rect: Rect;
    output: string;
}

export type Output = {
    name: string;
    active: boolean;
    primary: boolean;
    current_workspace: string | null;
    rect: Rect;
}

export type TreeNode = {
    id: number;
    name: string;
    type: "root" | "output" | "con" | "floating_con" | "workspace" | "dockarea";
    border: "normal" | "none" | "pixel";
    current_border_width: number;
    layout: "splith" | "splitv" | "stacked" | "tabbed" | "dockarea" | "output";
    orientation: "none" | "horizontal" | "vertical";
    percent: number | null;
    rect: Rect;
    window_rect: Rect;
    deco_rect: Rect;
    geometry: Rect;
    window: number | null;

    // might replace with X11 window props
    window_properties: {[key: string]: any} & {
        class: string;
    };

    window_type: undefined | "unknown" | "normal" | "dialog" | "utility" | "toolbar" | "splash" | "menu" | "dropdown_menu" | "popup_menu" | "tooltip" | "notification";
    urgent: boolean;
    marks: string[];
    focused: boolean;
    focus: number[];
    sticky: boolean;
    fullscreen_mode: 0 | 1 | 2;
    floating: "auto_on" | "auto_off" | "user_on" | "user_off";
    nodes: TreeNode[];
    floating_nodes: TreeNode[];
    scratchpad_state: "none" | "fresh" | "changed";
}

export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type Binding = {
    command: string;
    event_state_mask: string[];
    input_code: number;
    symbol: string | null;
    input_type: string;
}

export type REPLY_COMMAND = {
    data: {
        success: boolean;
        error?: string;
    }[];
}

export type REPLY_WORKSPACES = {
    data: Workspace[];
}

export type REPLY_SUBSCRIBE = {
    data: {
        success: boolean;
    }
}

export type REPLY_OUTPUTS = {
    data: Output[];
}

export type REPLY_TREE = {
    data: TreeNode[];
}

export type REPLY_VERSION = {
    data: {
        major: number;
        minor: number;
        patch: number;
        human_readable: string;
        loaded_config_file_name: string;
    }
}

export type REPLY_CONFIG = {
    data: {
        config: string;
        included_configs: {
            path: string;
            raw_contents: string;
            variable_replaced_contents: string;
        }[];
    }
}

export type Reply = (REPLY_COMMAND | REPLY_WORKSPACES | REPLY_SUBSCRIBE | REPLY_OUTPUTS | REPLY_TREE | REPLY_VERSION | REPLY_CONFIG) & {
    message_type: number;
};

export type EVENT_WORKSPACE = {
    data: {
        change: "focus" | "init" | "empty" | "uregent" | "reload" | "rename" | "restored" | "move";
        current: Workspace;
        old: Workspace;
    }
}

export type EVENT_OUTPUT = {
    data: {
        change: "unspecified"
    }
};

export type EVENT_MODE = {
    data: {
        change: string;
        pango_markup: boolean;
    }
}

export type EVENT_WINDOW = {
    data: {
        change: "new" | "close" | "focus" | "title" | "fullscreen_mode" | "move" | "floating" | "urgent" | "mark",
        container: TreeNode
    }
}

export type EVENT_BARCONFIG_UPDATE = {
    data: {

    }
}

export type EVENT_BINDING = {
    data: {
        change: "run";
        binding: Binding;
    }
}

export type EVENT_SHUTDOWN = {
    data: {
        change: "restart" | "exit";
    }
}

export type EVENT_TICK = {
    data: {
        first: boolean;
        payload: string;
    }
}

export type EventReply = (EVENT_WORKSPACE | EVENT_OUTPUT | EVENT_MODE | EVENT_WINDOW | EVENT_BARCONFIG_UPDATE | EVENT_BINDING | EVENT_SHUTDOWN | EVENT_TICK) & {
    message_type: number;
};

export type Events = "workspace" | "output" | "mode" | "window" | "barconfig_update" | "binding" | "shutdown" | "tick";

const EVENT_NUM_TO_STRING: {
    [key: number]: Events
} = {
    0: "workspace",
    1: "output",
    2: "mode",
    3: "window",
    4: "barconfig_update",
    5: "binding",
    6: "shutdown",
    7: "tick"
};