export function getCurrentLine(editor: TextEditor): number {
    const hackRange = new Range(0, editor.selectedRange.end - 1);
    const selectedText = editor.getTextInRange(hackRange);
    const currentLineNumber = selectedText.split(/\r\n|\r|\n/).length;
    return currentLineNumber;
}

export function getContentByLine(lineNumber: number, path: string): string {
    const file = nova.fs.open(path, "r") as FileTextMode;
    const lines = file.readlines();
    lineNumber = Math.min(lineNumber, lines.length - 1);
    return lines[lineNumber - 1];
}

export function getRelativePath(child: string, parent: string): string | null {
    const matchedLength = matchStringFromHead(child, parent);
    if (matchedLength != parent.length) {
        return null;
    }
    let relativePath = child.slice(matchedLength);
    if (relativePath.charAt(0) == "/") {
        relativePath = relativePath.slice(1);
    }
    return relativePath;
}

export function matchStringFromHead(str1: string, str2: string): number {
    const minLength = Math.min(str1.length, str2.length);
    for (let i = 0; i < minLength; i += 1) {
        if (str1.charAt(i) != str2.charAt(i)) {
            return i;
        }
    }
    return minLength;
}

export function assert(value: boolean, message: string | null=null): void {
    if (!value) {
        if (message != null) {
            throw new Error(`assert False: ${message}`);
        } else {
            throw new Error(`assert False`);
        }
    }
}

export function buildNotificationRequest(identifier: string, title: string, body: string): NotificationRequest {
    const request = new NotificationRequest(identifier);
    request.title = title;
    request.body = body;
    return request;
}