import { runCommand } from "../commands";
import { EVENT_BINDING, ipcEvents } from "../ipc_socket";
import { getActiveWindow, getProcessEnv, getWindowProps } from "./logic";

ipcEvents.on("binding", (bindingEvent: EVENT_BINDING) => {
    const { binding } = bindingEvent.data;
    
    if(binding.command == "nop" && (binding.symbol == "h" || binding.symbol == "v")) {
        runCommand("split " + binding.symbol);

        const windowProps = getWindowProps(getActiveWindow()!);

        if(windowProps["WM_CLASS(STRING)"][0] == "Alacritty") {
            const activePID = windowProps["_NET_WM_PID(CARDINAL)"][0];

            runCommand("exec alacritty --working-directory " + getProcessEnv(activePID).PWD);
            return;
        }
    }
});