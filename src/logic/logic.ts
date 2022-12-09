import { execSync } from "child_process";
import "./auto_split_term";
import "./workspace_pos";

export function getActiveWindow() {
    const r = execSync("xprop -root").toString("utf-8").split("\n").find(u => u.startsWith("_NET_ACTIVE_WINDOW(WINDOW)"));
    if(!r) return null;

    return Number.parseInt(r.substring(r.lastIndexOf("#") + 2), 16);
}

export function getWindowProps(window_id: number) {
    const r = execSync("xprop -id " + window_id).toString("utf-8").split("\n").filter(u => !u.startsWith("\t") && u.length > 1 && !u.startsWith("\x1B")).filter(u => u.split("=").length >= 2);

    const l: {[key: string]: string[]} = {};

    for(const u of r) {
        const v = u.split("=").map(o => o.trim());

        l[v.shift()!] = v[0].split(",").map(o => o.replace(/['"]/g, "").trim());
    }

    return l;
}

export function getProcessEnv(process_id: number | string) {
    const r = execSync("ps ewwo command " + process_id).toString("utf-8").split("\n")[1].split(" ");
    r.shift();

    const l: {[key: string]: string} = {};

    for(const u of r.map(v => v.split("="))) {
        if(u[0]=="" || u[1] == undefined) continue;
        l[u.shift()!] = u[0];
    }

    return l;
}