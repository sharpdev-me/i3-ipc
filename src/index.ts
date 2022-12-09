import { runCommand } from "./commands";
import { connect } from "./ipc_socket";

import "./logic/logic";

connect().then(() => {
    console.log("ipc connected");

    runCommand("default_border pixel 3");
    runCommand("[all] border pixel 3");
    runCommand("gaps inner all set 20");
    runCommand("bar mode hide");
});