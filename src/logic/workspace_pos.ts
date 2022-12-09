import { runCommand } from "../commands";
import { EVENT_WORKSPACE, ipcEvents } from "../ipc_socket";

ipcEvents.on("workspace", (parsed: EVENT_WORKSPACE) => {
    if(parsed.data.change != "init") return;

    const workspace = parsed.data.current;
    
    // even workspace, put on HDMI-0
    if(workspace.num % 2 == 0) {
        runCommand("move workspace to output HDMI-0");
    } else {
        // otherwise, DP-0
        runCommand("move workspace to output DP-0");
    }
});