import { getContentByLine, getRelativePath } from "./utils";
export type ItemType = FileItem | BookmarkItem;

export type BookmarkItemObject = {lineNumber: number};
export class BookmarkItem {
    get name(): string {
        if (!this.parent) {
            throw new Error("Cannot get content of bookmark without explicit file path")
        }
        let content = getContentByLine(this.lineNumber, this.parent.path);
        content = content.trim();
        return `#${this.lineNumber}: ${content}`;
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

export type FileItemObject = {relativePath: string, children: BookmarkItemObject[]};

export class FileItem {
    children: BookmarkItem[] = [];
    path: string;
    //
    parent: null = null;
    collapsed: boolean = false;
    
    constructor(path: string) {
        this.path = path;
    }
    
    get name(): string {
        return nova.path.basename(this.path);
    }
    
    addChild(element: BookmarkItem): void {
        element.parent = this;
        this.children.push(element);
    }
    
    addChildren(elements: BookmarkItem[]): void {
        elements.forEach((e) => { e.parent = this; });
        this.children.push(...elements);
    }
    
    toObject(relativePath: string): FileItemObject {
        return {
            relativePath: relativePath, 
            children: this.children.map((bookmark) => bookmark.toObject())
        };
    }
    
    static fromObject(object: FileItemObject, workspacePath: string): FileItem {
        const fileItem = new FileItem(nova.path.join(workspacePath, object.relativePath));
        const childrenItems = object.children.map((child) => BookmarkItem.fromObject(child));
        fileItem.addChildren(childrenItems);
        return fileItem;
    }
}

export class BookmarkDataProvider implements TreeDataProvider<ItemType> {
    rootItems: FileItem[]
    treeView: TreeView<ItemType> | null = null;
    fileListenerDisposable: {[path: string]: Disposable[]} = {};
    
    constructor() {
        this.rootItems = loadBookmarks();
    }
    
    getChildren(element: ItemType | null): (ItemType)[] {
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
        let item: TreeItem = new TreeItem(element.name);
        if (element instanceof FileItem) {
            item.collapsibleState = element.collapsed ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded;
            item.contextValue = "file";
            item.path = element.path;
            return item;
        } else {
            item.image = "__symbol.bookmark";
            item.command = "bookmarks.doubleClick";
            item.contextValue = "bookmark";
            return item;
        }
    }
    
    addBookmark(path: string, lineNumber: number, editor: TextEditor): void {
        const fileItems = this.rootItems.filter((fileItem, _) => fileItem.path === path);
        let fileItem: FileItem;
        let newFileItem: boolean;
        if (fileItems.length == 0) {
            fileItem = new FileItem(path);
            this.configureListener(fileItem, editor);
            this.rootItems.push(fileItem);
            this.rootItems.sort((x, y) => {return (x > y) ? -1 : 1; });
            newFileItem = true;
        } else if (fileItems.length == 1) {
            fileItem = fileItems[0];
            newFileItem = false;
        } else {
            console.error(`multiple fileItem match path ${path}`);
            return;
        }
        if (fileItem.children.some((item) => item.lineNumber == lineNumber)) {
            // bookmark exists
            return;
        }
        const bookmarkItem = new BookmarkItem(lineNumber);
        fileItem.addChild(bookmarkItem);
        fileItem.children.sort((x, y) => (x.lineNumber < y.lineNumber) ? -1 : 1);
        if (newFileItem) {
            this.treeView?.reload(); // reload the whole tree view
        } else {
            this.treeView?.reload(fileItem);
        }
        saveBookmarks(this.rootItems);
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
        this.rootItems = this.rootItems.filter((thisItem) => thisItem.path != item.path);
        if (this.fileListenerDisposable[item.path]) {
            delete this.fileListenerDisposable[item.path];
        }
        this.treeView?.reload();
    }
    
    removeBookmarkItemImpl(item: BookmarkItem): void {
        const fileItem = item.parent!;
        fileItem.children = fileItem.children.filter((thisItem) => thisItem.lineNumber != item.lineNumber);if (fileItem.children.length == 0) {
            this.removeFileItem(fileItem);
        }
        if (fileItem.children.length == 0) {
            this.removeFileItem(fileItem);
        } else {
            this.treeView?.reload(fileItem);
        }
    }
    
    get bookmarksIterable(): BookmarkItem[] {
        let bookmarks: BookmarkItem[] = [];
        for (const fileItem of this.rootItems) {
            bookmarks.push(...fileItem.children);
        }
        return bookmarks;
    }
    
    getFileItem(path: string): FileItem | undefined {
        return this.rootItems.find((item) => item.path === path);
    }
    
    configureListener(fileItem: FileItem, editor: TextEditor): void {
        const onDidSave = editor.onDidSave(
            onDidStopChangingListener(this.treeView!, fileItem)
        );
        this.fileListenerDisposable[fileItem.path] = [onDidSave]
        editor.onDidDestroy((_) => {
            if (this.fileListenerDisposable[fileItem.path]) {
                delete this.fileListenerDisposable[fileItem.path];
            }
        });
    }
}

const novaFolderName = ".nova";
const extensionFolderName = "Bookmarks";
const fileName = "bookmarks.json";

export function saveBookmarks(items: FileItem[]): void {
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
    const itemObjects = items
        .filter((item) => getRelativePath(item.path, workspacePath) != null)
        .map((item) => item.toObject(getRelativePath(item.path, workspacePath)!));
    file.write(JSON.stringify(itemObjects, null, 4));
}

export function loadBookmarks(): FileItem[] {
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
        console.error(`read json failed: ${bookmarksSavePath}`);
        return [];
    }
    const itemObjects = JSON.parse(jsonString);
    const items = (itemObjects as FileItemObject[])
        .map((object) => FileItem.fromObject(object, workspacePath));
    return items;
}

export function reloadAll(treeView: TreeView<ItemType>, dataProvider: BookmarkDataProvider): void {
    dataProvider.bookmarksIterable.forEach((bookmark) => {
        treeView.reload(bookmark);
    });
}

export function reloadAllBookmarks(treeView: TreeView<ItemType>, fileItem: FileItem): void {
    fileItem.children.forEach((item) => {
        treeView.reload(item);
    });
}

export const onDidStopChangingListener = (treeView: TreeView<ItemType>, fileItem: FileItem) => {
    const g: (editor: TextEditor) => void = (_: TextEditor) => {
        if (!treeView) { 
            return; 
        }
        reloadAllBookmarks(treeView, fileItem);
    };
    return g;
};