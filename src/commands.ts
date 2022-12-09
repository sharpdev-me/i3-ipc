import { MESSAGE_TYPE, send } from "./ipc_socket";

export function runCommand(command: string) {
    return send(MESSAGE_TYPE.RUN_COMMAND, command);
}

export function runCommands(commands: string[]) {
    for(const command of commands) runCommand(command);
}