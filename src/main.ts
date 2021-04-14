import { BookmarkDataProvider, BookmarkItem, FileItem, ItemType, reloadAll } from "./dataprovider";
import { buildNotificationRequest, getCurrentLine } from "./utils";

let treeView: TreeView<ItemType> | null = null;
let dataProvider: BookmarkDataProvider | null = null;


export const activate = function() {
    dataProvider = new BookmarkDataProvider();
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
    
    treeView.onDidCollapseElement((element) => {
        if (element instanceof BookmarkItem) {
            return
        }
        element.collapsed = true;
    });
}

export const deactivate = function() {
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

nova.commands.register("bookmarks.refresh", () => {
    // Invoked when the "remove" header button is clicked
    if (!treeView || !dataProvider) {
        console.log("!treeView || !dataProvider");
        return;
    }
    reloadAll(treeView, dataProvider);
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
    nova.workspace.openFile(selection.parent!.path, {line: selection.lineNumber});
});

nova.commands.register("addBookmark", (editor: TextEditor) => {
    if (!treeView || !dataProvider) { 
        console.error("treeView or dataProvider not exist")
        return;
    }
    const lineNumber = getCurrentLine(editor);
    const documentPath = editor.document.path;
    if (!documentPath) {
        nova.notifications.add(buildNotificationRequest(
            "cannot-add-bookmark", 
            "Cannot Add the Bookmark", 
            "The path of the document doesn't exist, since the document is remote or unsaved"
        ));
        return;
    }
    dataProvider.addBookmark(documentPath, lineNumber, nova.workspace.activeTextEditor);
});

nova.workspace.onDidAddTextEditor((editor: TextEditor) => {
    const workspacePath = nova.workspace.path;
    const documentPath = editor.document.path;
    if (!workspacePath || !documentPath) {
        return;
    }
    if (!dataProvider || !treeView) {
        console.error("dataProvider or treeView not exist");
        return;
    }
    const fileItem = dataProvider.getFileItem(documentPath);
    if (!fileItem) {
        return;
    }
    dataProvider.configureListener(fileItem, editor);
});
