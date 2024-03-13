const registeredScripts = {}
const waitingForScripts = {}
_satellite.__registerScript = function(url, code){
  registeredScripts[url] = code
  if(waitingForScripts[url]){
    for (const cb of waitingForScripts[url]) {
      cb(code)
    }
    delete waitingForScripts[url]
  }
}
function loadScript(url) {
  if (registeredScripts[url]) {
    return Promise.resolve(registeredScripts[url])
  }
  return new Promise((resolve, reject) => {
    if (!waitingForScripts[url]) {
      waitingForScripts[url] = []
      var script = document.createElement('script')
      script.src = url
      script.onerror = reject
      document.head.appendChild(script)
    }
    waitingForScripts[url].push(resolve)
  })
}
const sliceFirstAndLastLineOff = str => str.slice(str.indexOf('\n')+1, str.lastIndexOf('\n'))
const selectKeys = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([key, value]) => keys.includes(key)))
const to_json = obj => JSON.stringify(obj, ' ', 2)

async function writeFile(folder, filename, item) {
  var type, value
  if (item.modulePath.endsWith('customCode.js')) {
    type = item.settings.language || 'js'
    if (type === 'javascript')
      type = 'js';
    
    if (item.settings.isExternal) {
      value = await loadScript(item.settings.source)
    } else if (typeof item.settings.source == 'function') {
      value = sliceFirstAndLastLineOff(item.settings.source.toString()).trim()
    } else {
      value = item.settings.source
    }
  } else {
    type = 'jsonc'
    value = '// ' + item.modulePath + '\n'
      + to_json(item.settings, ' ', 2)
  }
  folder.file(filename + '.' + type, value)
}

async function writeFiles(folder, filename, items){
  var i = 0
  var isSingle = items.length < 2
  for await (var item of items) {
    i++
    await writeFile(folder, filename+(isSingle?'':i), item)
  }
}

async function collectFiles() {
  const zip = new JSZip();
  zip.file("info.json", to_json(selectKeys(_satellite._container, ['buildInfo','company','environment','property'])))

  const dataElements = zip.folder('dataElements')
  for await (var [key, value] of Object.entries(_satellite._container.dataElements)) {
    writeFile(dataElements, key, value)
  }
  
  const rules = zip.folder('rules')
  for await (var rule of _satellite._container.rules){
    const ruleFolder = rules.folder(rule.name)
    await writeFiles(ruleFolder, 'event', rule.events)
    await writeFiles(ruleFolder, 'condition', rule.conditions)
    await writeFiles(ruleFolder, 'action', rule.actions)
  }
  const content = await zip.generateAsync({type:"blob"})
  saveAs(content, 'property-dump-' + _satellite.property.name + '-' + _satellite.environment.stage + '.zip')
}

function addLaunchScript() {
  if (window._satellite) {
    alert('Launch already loaded. Please refresh the page.')
    return
  }
  var script = document.createElement('script')
  script.src = document.getElementById('launch-script').value
  script.onload = collectFiles
  script.onerror = () => alert('Failed to load Launch script.')
  document.head.appendChild(script)
}
