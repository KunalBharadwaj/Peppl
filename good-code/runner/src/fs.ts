import fs from "fs";
import path from "path";

interface File {
    type: "file" | "dir";
    name: string;
}

export const WORKSPACE_ROOT = "/workspace";

// Resolve a client-supplied, workspace-relative path to an absolute path that is
// guaranteed to stay inside WORKSPACE_ROOT. Any leading slashes are stripped so an
// absolute-looking input can't escape, and "../" traversal is neutralized by
// normalization + a prefix check. Throws if the path would escape the workspace.
export const resolveWorkspacePath = (relPath: string): string => {
    const normalizedRel = String(relPath ?? "").replace(/^\/+/, "");
    const resolved = path.resolve(WORKSPACE_ROOT, normalizedRel);
    if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
        throw new Error("Path escapes workspace");
    }
    return resolved;
};

export const fetchDir = (dir: string, baseDir: string): Promise<File[]>  => {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, { withFileTypes: true }, (err, files) => {
            if (err) {
                reject(err);
            } else {
                resolve(files.map(file => ({ type: file.isDirectory() ? "dir" : "file", name: file.name, path: `${baseDir}/${file.name}`  })));
            }
        });       
    });
}

export const fetchFileContent = (file: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        fs.readFile(file, "utf8", (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
}

export const saveFile = async (file: string, content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, content, "utf8", (err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}