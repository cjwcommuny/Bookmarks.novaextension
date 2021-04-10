
let treeView: TreeView<ItemType> | null = null;
let dataProvider: BookmarkDataProvider | null = null;


exports.activate = function() {
    // Do work when the extension is activated
    dataProvider = new BookmarkDataProvider();
    // Create the TreeView
    treeView = new TreeView("bookmarks", {
        dataProvider: dataProvider
    });
    dataProvider.treeView = treeView;
    
    treeView.onDidExpandElement((element) => {
        if (element instanceof BookmarkItem) {
            return
        }
        element.collapsed = false;
    });
    
    // treeView.onDidChangeVisibility(() => {
    //     if (!treeView || !dataProvider) {
    //         return;
    //     }
    //     reloadAll(treeView, dataProvider);
    // });
    
    treeView.onDidCollapseElement((element) => {
        if (element instanceof BookmarkItem) {
            return
        }
        element.collapsed = true;
    });
    
    treeView.onDidChangeVisibility(() => {
    });
    
    // TreeView implements the Disposable interface
    nova.subscriptions.add(treeView);
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
    treeView = null;
    dataProvider = null;
}

nova.commands.register("bookmarks.remove", () => {
    // Invoked when the "remove" header button is clicked
    if (!treeView) {
        return;
    }
    const selections = treeView.selection;
    selections.forEach((item) => {
        dataProvider?.removeBookmark(item);
    });
});

nova.commands.register("bookmarks.doubleClick", () => {
    // Invoked when an item is double-clicked
    if (!treeView) {
        return;
    }
    const selection = treeView.selection[0];
    if (selection instanceof FileItem) {
        return;
    }
    const absolutePath = nova.path.join(nova.workspace.path!, selection.parent!.relativePath);
    nova.workspace.openFile(absolutePath, {line: selection.lineNumber});
});

nova.commands.register("bookmarks.showInFinder", (workspace: Workspace) => {
    if (!treeView) {
        return;
    }
    const workspacePath = nova.workspace.path;
    if (!workspacePath) {
        return;
    }
    const selection = treeView.selection[0] as FileItem;
    const path = nova.path.join(workspacePath, selection.relativePath);
    nova.fs.reveal(path);
});

type ItemType = FileItem | BookmarkItem;
type BookmarkItemObject = {lineNumber: number};
class BookmarkItem {
    private _name: string | null = null;
    get name(): string {
        if (this._name != null) {
            return this._name;
        }
        const absolutePath = nova.path.join(nova.workspace.path!, this.parent!.relativePath)
        let content = getContentByLine(this.lineNumber, absolutePath);
        content = content.trim();
        this._name = `#${this.lineNumber}: ${content}`
        return this._name;
    }
    parent: FileItem | null = null
    lineNumber: number;
    
    constructor(lineNumber: number) {    
        this.lineNumber = lineNumber;
    }
    
    toObject(): {lineNumber: number} {
        return {lineNumber: this.lineNumber}
    }
    
    static fromObject(object: BookmarkItemObject): BookmarkItem {
        return new BookmarkItem(object.lineNumber);
    }
}

type FileItemObject = {path: string, children: BookmarkItemObject[]};
class FileItem {
    children: BookmarkItem[] = [];
    name: string;
    parent: null = null;
    relativePath: string;
    collapsed: boolean = false;
    
    constructor(relativePath: string) {
        this.name = nova.path.basename(relativePath);
        this.relativePath = relativePath;
    }
    
    addChild(element: BookmarkItem): void {
        element.parent = this;
        this.children.push(element);
    }
    
    addChildren(elements: BookmarkItem[]): void {
        elements.forEach((e) => { e.parent = this; });
        this.children.push(...elements);
    }
    
    toObject(): {path: string, children: {lineNumber: number}[]} {
        return {
            path: this.relativePath, 
            children: this.children.map((bookmark) => { 
                return bookmark.toObject(); 
            })
        };
    }
    
    static fromObject(object: FileItemObject): FileItem {
        const fileItem = new FileItem(object.path);
        const childrenItems = object.children.map((child) => BookmarkItem.fromObject(child));
        fileItem.addChildren(childrenItems);
        return fileItem;
    }
}

class BookmarkDataProvider implements TreeDataProvider<ItemType> {
    rootItems: FileItem[]
    treeView: TreeView<ItemType> | null = null;
    fileListenerDisposable: {[path: string]: Disposable} = {};
    
    constructor() {
        this.rootItems = loadBookmarks()
    }
    
    getChildren(element: ItemType | null): (ItemType)[] {
        // Requests the children of an element
        if (!element) {
            return this.rootItems;
        } else if (element instanceof BookmarkItem) {
            return [];
        } else {
            return element.children;
        }
    }
    
    getParent(element: ItemType): FileItem | null {
        // Requests the parent of an element, for use with the reveal() method
        return element.parent;
    }
    
    getTreeItem(element: ItemType): TreeItem {
        // Converts an element into its display (TreeItem) representation
        const workspacePath = nova.workspace.path!;
        let item: TreeItem = new TreeItem(element.name);
        if (element instanceof FileItem) {
            item.collapsibleState = element.collapsed ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded;
            item.contextValue = "file";
            item.path = nova.path.join(workspacePath, element.relativePath);
            return item;
        } else {
            item.image = "__symbol.bookmark";
            item.command = "bookmarks.doubleClick";
            item.contextValue = "bookmark";
            return item;
        }
    }
    
    addBookmark(relativePath: string, lineNumber: number, editor: TextEditor): void {
        const fileItems = this.rootItems.filter((fileItem, _) => fileItem.relativePath === relativePath);
        let fileItem: FileItem;
        let newFileItem: boolean;
        if (fileItems.length == 0) {
            fileItem = new FileItem(relativePath);
            this.fileListenerDisposable[fileItem.relativePath] = editor.onDidStopChanging((editor) => {
                if (!treeView) { return; }
                reloadAllBookmarks(treeView, fileItem);
            });
            this.rootItems.push(fileItem);
            this.rootItems.sort((x, y) => {return (x > y) ? -1 : 1; });
            newFileItem = true;
        } else {
            fileItem = fileItems[0];
            newFileItem = false;
        }
        if (fileItem.children.some((item) => item.lineNumber == lineNumber)) {
            return;
        }
        const bookmarkItem = new BookmarkItem(lineNumber);
        fileItem.addChild(bookmarkItem);
        fileItem.children.sort((x, y) => (x.lineNumber < y.lineNumber) ? -1 : 1);
        saveBookmarks(this.rootItems);
        if (newFileItem) {
            this.treeView?.reload(); // reload the whole tree view
        } else {
            this.treeView?.reload(fileItem);
        }
    }
    
    removeBookmark(item: ItemType): void {
        if (item instanceof FileItem) {
            this.removeFileItem(item);
        } else {
            this.removeBookmarkItemImpl(item);
        }
        saveBookmarks(this.rootItems);
    }
    
    removeFileItem(item: FileItem): void {
        this.rootItems = this.rootItems.filter((thisItem) => thisItem.relativePath != item.relativePath);
        this.fileListenerDisposable[item.relativePath].dispose();
        this.treeView?.reload()
    }
    
    removeBookmarkItemImpl(item: BookmarkItem): void {
        const fileItem = item.parent!;
        fileItem.children = fileItem.children.filter((thisItem) => thisItem.lineNumber != item.lineNumber);if (fileItem.children.length == 0) {
            this.removeFileItem(fileItem);
        }
        if (fileItem.children.length == 0) {
            this.removeFileItem(fileItem);
        }
        this.treeView?.reload(fileItem)
    }
    
    get bookmarksIterable(): BookmarkItem[] {
        let bookmarks: BookmarkItem[] = [];
        for (const fileItem of this.rootItems) {
            bookmarks.push(...fileItem.children);
        }
        return bookmarks;
    }
}

nova.commands.register("addBookmark", (editor: TextEditor) => {
    if (!treeView || !dataProvider) { 
        return;
    }
    const lineNumber = getCurrentLine(editor);
    const documentPath = editor.document.path;
    if (!documentPath) {
        return;
    }
    const workspacePath = nova.workspace.path;
    if (!workspacePath) {
        return;
    }
    const relativePath = isChildPath(documentPath, workspacePath);
    if (!relativePath) {
        return;
    }
    dataProvider.addBookmark(relativePath, lineNumber, nova.workspace.activeTextEditor);
});

function getCurrentLine(editor: TextEditor): number {
    const hackRange = new Range(0, editor.selectedRange.end - 1)
    const selectedText = editor.getTextInRange(hackRange);
    const currentLineNumber = selectedText.split(/\r\n|\r|\n/).length;
    return currentLineNumber;
}

const novaFolderName = ".nova";
const extensionFolderName = "Bookmarks";
const fileName = "bookmarks.json";

function saveBookmarks(items: FileItem[]): void {
    const workspacePath = nova.workspace.path;
    if (!workspacePath) {
        return;
    }
    const novaFolderPath = nova.path.join(workspacePath, novaFolderName);
    if (nova.fs.stat(novaFolderPath) == null) {
        nova.fs.mkdir(novaFolderPath);
    }
    const extensionFolderPath = nova.path.join(novaFolderPath, extensionFolderName);
    if (nova.fs.stat(extensionFolderPath) == null) {
        nova.fs.mkdir(extensionFolderPath);
    }
    const bookmarksSavePath = nova.path.join(extensionFolderPath, fileName);
    const file = nova.fs.open(bookmarksSavePath, "w");
    const itemObjects = items.map((item) => item.toObject());
    file.write(JSON.stringify(itemObjects, null, 4));
}

function loadBookmarks(): FileItem[] {
    const workspacePath = nova.workspace.path;
    if (!workspacePath) {
        return [];
    }
    const bookmarksSavePath = nova.path.join(workspacePath, novaFolderName, extensionFolderName, fileName);
    if (nova.fs.stat(bookmarksSavePath) == null) {
        return [];
    }
    const file = nova.fs.open(bookmarksSavePath, "r") as FileTextMode;
    const jsonString = file.read();
    if (!jsonString) {
        return [];
    }
    const itemObjects = JSON.parse(jsonString);
    const items = (itemObjects as FileItemObject[]).map((object) => FileItem.fromObject(object));
    return items;
}


function getContentByLine(lineNumber: number, path: string): string {
    const file = nova.fs.open(path, "r") as FileTextMode;
    const lines = file.readlines();
    return lines[lineNumber - 1];
}

function isChildPath(child: string, parent: string): string | null {
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

function matchStringFromHead(str1: string, str2: string): number {
    const minLength = Math.min(str1.length, str2.length);
    for (let i = 0; i < minLength; i += 1) {
        if (str1.charAt(i) != str2.charAt(i)) {
            return i;
        }
    }
    return minLength;
}

function reloadAll(treeView: TreeView<ItemType>, dataProvider: BookmarkDataProvider): void {
    dataProvider.bookmarksIterable.forEach((bookmark) => {
        treeView.reload(bookmark);
    });
}

function reloadAllBookmarks(treeView: TreeView<ItemType>, fileItem: FileItem): void {
    fileItem.children.forEach((item) => {
        treeView.reload(item);
    });
}