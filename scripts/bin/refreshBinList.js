.pragma library
.import "flattenTree.js" as FlattenTree

function refreshBinList(vaultFs, binModel) {
    if (vaultFs) {
        binModel.clear();
        FlattenTree.flattenTree(vaultFs.getBinTree(), 0, binModel);
    }
}
