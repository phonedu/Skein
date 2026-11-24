### New

- On a phone, Today and Files switch with the desktop's tab capsule under the bar, in one tap, instead of going through the ⋯ sheet.
- On a phone, the document's ⋯ sheet opens its outline: every heading, indented by level, with the section you are reading ticked. Tap one to go there.
- Share hands the document to the system's own share sheet. A document that has not been saved has nothing to share, so the row rests until it does.

### Improved

- A phone's command palette is the page itself — the field under the status bar, the list filling the rest, a finger's rows — instead of a floating card the keyboard cut in half.
- The command palette marks what is on: the mode in force, a shown format bar, the sidebar. Choosing a mode used to leave the palette still ticking "Default", with nothing saying what was chosen.
- Today's changes are kept from the last walk: switching to Files and back shows the list at once while the folder is read again, rather than waiting for a slow phone walk each time.
- On a phone with no collect plugin, 记一句 opens a note to type in at once — no naming row, no trip through the library. Until it has a file it says "Draft · not saved", and it saves itself once there is something to write.
- A plugin's form on a phone keeps each field inset in the dialog's card, on the card's own surface, with the interface's accent for focus and caret instead of a webview's default ring.
- A phone's file tree steps one width a level: the first step is as wide as the rest, a file's icon stands level with its sibling folders' icons, and the folder guide lines run through the folders' chevrons instead of a step to their right.
- A phone draws no scrollbars: the finger does the scrolling, and the one down the home list's edge left a seam on the paper.
- A settings search result stays one row in any language: its icon sits beside the name (a longer English label no longer pushes the words to a second line), and a folded row is named by its name alone, not its name and its value run together.

### Fixed

- A document not saved yet opens from Today's current-delivery card — it used to do nothing — and its line says "Draft · not saved" instead of leaving the card looking broken.
- A plugin whose manifest names Android installs and runs on an Android phone: the app refused `android` as an unknown platform, so an updated plugin was turned away with "No platform android".
- Android's left-edge Back gesture reaches the app again: the phone layout no longer reserves a band of the left edge for a sidebar it does not show. Both edges step back now.
- Android's Back from the AI page returns to the document it was opened over, and the next Back to Today: reading the AI as the page in front brought it forward again, so the two pages alternated forever.
- Android's Back steps back through the app instead of leaving it: an open sheet or the find bar closes, the AI page returns to the document, the document to the library, and Settings' pages go back to its list. From the library, Back puts the app away as before.
- With the AI page over a document on a phone, Textus AI reads that document: it stays loaded behind the page, so a review is sent with the document rather than without one.
