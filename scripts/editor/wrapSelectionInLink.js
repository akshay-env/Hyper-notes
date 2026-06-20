.pragma library

// Wrap the current selection in [[ ]]
function wrapSelection(textArea) {
    console.log("[WrapSelection] Triggered hotkey '['");
    if (!textArea) return;
    
    let start = textArea.selectionStart;
    let end = textArea.selectionEnd;
    
    if (start === end) return; // No selection
    
    // Ensure start is less than end
    if (start > end) {
        let temp = start;
        start = end;
        end = temp;
    }
    
    let selectedText = textArea.selectedText;
    console.log("[WrapSelection] Selected text:", selectedText, "at range", start, "-", end);
    
    // Replace the text
    // QML TextArea allows us to insert and remove, but the easiest way is to modify the text property 
    // or use remove/insert methods if available. QQuickTextEdit has `remove(start, end)` and `insert(pos, text)`.
    textArea.remove(start, end);
    textArea.insert(start, "[[" + selectedText + "]]");
    console.log("[WrapSelection] Replaced text with:", "[[" + selectedText + "]]");
    
    // Restore selection or cursor position
    // Place cursor right after the newly inserted text
    textArea.cursorPosition = start + selectedText.length + 4;
    console.log("[WrapSelection] Adjusted cursor position to:", textArea.cursorPosition);
}
