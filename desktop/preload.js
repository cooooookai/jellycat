const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => ipcRenderer.on(ch, (e, d) => cb(d));

contextBridge.exposeInMainWorld('jc', {
  onState: on('state'),
  onMsg: on('msg'),
  onLocalBubble: on('local-bubble'),
  onInput: on('input'),
  onScale: on('scale'),
  setSolid: (b) => ipcRenderer.send('solid', b),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  menu: () => ipcRenderer.send('menu'),
  resize: (w, h) => ipcRenderer.send('resize', { w, h }),
  sendMsg: (t) => ipcRenderer.send('send-msg', t),
  poke: () => ipcRenderer.send('poke'),
  sendMeeting: (u) => ipcRenderer.send('send-meeting', u),
  openUrl: (u) => ipcRenderer.send('open-url', u),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  closeSettings: () => ipcRenderer.send('close-settings'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  makeCode: (o) => ipcRenderer.invoke('make-code', o),
  applyCode: (c) => ipcRenderer.invoke('apply-code', c),
});
