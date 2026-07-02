# Third-party notices

HyperLinkNotes' own source code is licensed under the Apache License 2.0
(see `LICENSE`).

This application is built with and distributes the **Qt framework**
(https://www.qt.io), used under the **GNU Lesser General Public License v3
(LGPLv3)**.

- The app **dynamically links** Qt's shared libraries (the `Qt6*.dll` and plugin
  files shipped next to the executable). It does not statically link or modify Qt.
- Qt is copyright The Qt Company Ltd and contributors. It is **not** covered by
  this project's MIT license — it remains under the LGPLv3.
- Under the LGPL you may run and redistribute these Qt libraries, and you retain
  the right to replace them with a compatible build of Qt.

References:
- Qt licensing: https://doc.qt.io/qt-6/lgpl.html
- LGPLv3 text: https://www.gnu.org/licenses/lgpl-3.0.html

The bundled MinGW runtime libraries (`libgcc`, `libstdc++`, `libwinpthread`) are
distributed under their respective GCC runtime licenses.
