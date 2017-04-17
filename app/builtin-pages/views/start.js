/*
This uses the beaker.bookmarks API, which is exposed by webview-preload to all
sites loaded over the beaker: protocol
*/

import * as yo from 'yo-yo'
import {ArchivesList} from 'builtin-pages-lib'
import ColorThief from '../../lib/fg/color-thief'
import {findParent} from '../../lib/fg/event-handlers'
import {pluralize} from '../../lib/strings'

const colorThief = new ColorThief()

const LATEST_VERSION = 6001 // semver where major*1mm and minor*1k; thus 3.2.1 = 3002001

// globals
// =

var showReleaseNotes = false
var isManagingBookmarks = false
var isShelfOpen = false
var error = false
var userProfile
var archivesStatus
var bookmarks, pinnedBookmarks
var archivesList

setup()
async function setup () {
  await loadBookmarks()
  archivesStatus = await beaker.archives.status()
  userProfile = await beaker.profiles.get(0)
  try {
    userProfile.title = (await beaker.archives.get(userProfile.url)).title
  } catch (e) {
    userProfile.title = 'Your profile'
  }
  update()

  // subscribe to network changes
  beaker.archives.addEventListener('network-changed', ({details}) => {
    archivesStatus.peers = details.totalPeers
    yo.update(document.querySelector('a.network'), renderNetworkLink())
  })

  // render version update info if appropriate
  let latestVersion = await beakerSitedata.get('beaker://start', 'latest-version')
  if (+latestVersion < LATEST_VERSION) {
    showReleaseNotes = true
    update()
    beakerSitedata.set('beaker://start', 'latest-version', LATEST_VERSION)
  }

  // load archives list after render (its not pressing)
  archivesList = new ArchivesList({listenNetwork: true})
  await archivesList.setup({isSaved: true})
  console.log(archivesList.archives)
  archivesList.archives.sort((a, b) => {
    if (a.url === userProfile.url) return -1
    if (b.url === userProfile.url) return 1
    return niceName(a).localeCompare(niceName(b))
  })
}

// rendering
// =

function update () {
  yo.update(document.querySelector('main'), yo`
    <main>
      <header>
        <div class="actions">
          <a onclick=${createSite}><i class="fa fa-pencil"></i> New site</a>
          <a onclick=${shareFiles}><i class="fa fa-files-o"></i> Share files</a>
        </div>
        <div style="flex: 1"></div>
        ${renderProfileCard()}
      </header>
      ${renderShelf()}
      ${renderPinnedBookmarks()}
      ${renderReleaseNotes()}
    </main>
  `)
}

function renderProfileCard () {
  return yo`
    <div class="profile">
      ${renderNetworkLink()}
      ${''/*DISABLED <a href=${userProfile.url}>${userProfile.title} <i class="fa fa-user-circle-o"></i></a>*/}
    </div>
  `
}

function renderNetworkLink () {
  return yo`
    <a class="network" href="beaker://library">
      <i class="fa fa-share-alt"></i> ${archivesStatus.peers} ${pluralize(archivesStatus.peers, 'peer')}
    </a>
  `
}

function renderShelf () {
  if (!isShelfOpen) {
    return yo`
      <div class="shelf closed" onclick=${toggleShelf}>
        <i class="fa fa-angle-left"></i>
      </div>
    `
  }

  return yo`
    <div class="shelf open" onmouseout=${onMouseOutShelf}>
      <h3>
        <a href="beaker://library">Your library</a>
        <a class="link" onclick=${createSite}>+ New site</a>
      </h3>
      <div class="archives-list">
        ${archivesList.archives.map(archiveInfo => {
          const icon = archiveInfo.url === userProfile.url ? 'fa fa-user-circle-o' : 'fa fa-folder-o'
          return yo`
            <a class="archive" href=${archiveInfo.url}>
              <i class=${icon}></i>
              <span class="title">${niceName(archiveInfo)}</span>
              <span class="peers">${archiveInfo.peers} ${pluralize(archiveInfo.peers, 'peer')}</span>
              <span class="edit"><a href=${`beaker://editor/${archiveInfo.key}`}><i class="fa fa-pencil"></i> edit</a></span>
            </a>
          `
        })}
        <a class="link" href="beaker://library">Manage your library</a>
      </div>
      <h3><a href="beaker://bookmarks">Your bookmarks</a></h3>
      <div class="bookmarks">
        ${bookmarks.map(row => {
          return yo`
            <li class="bookmark ll-row">
              <a href=${row.url} class="link bookmark__link" title=${row.title} />
                <img class="favicon bookmark__favicon" src=${'beaker-favicon:' + row.url} />
                <span class="title bookmark__title">${row.title}</span>
              </a>
            </li>`
        })}
        <a class="link" href="beaker://bookmarks">Manage your bookmarks</a>
      </div>
    </div>
  `
}

function renderPinnedBookmarks () {
  var icon = isManagingBookmarks ? 'caret-down' : 'wrench'

  return yo`
    <div class="bookmarks-container">
      <p>
        <a class="add-pin-toggle" onclick=${toggleAddPin}>
          <i class="fa fa-${icon}"></i>
          ${isManagingBookmarks ? 'Close' : 'Manage bookmarks'}
        </a>
      </p>
      <div class="pinned-bookmarks">
        ${pinnedBookmarks.map(renderPinnedBookmark)}
      </div>
      ${renderBookmarks()}
    </div>
  `
}

function renderBookmarks () {
  if (!isManagingBookmarks) {
    return ''
  }

  const isNotPinned = row => !row.pinned

  const renderRow = row =>
    yo`
      <li class="bookmark ll-row">
        <a class="btn pin" onclick=${e => pinBookmark(e, row)}>
          <i class="fa fa-thumb-tack"></i> Pin
        </a>
        <a href=${row.url} class="link" title=${row.title} />
          <img class="favicon" src=${'beaker-favicon:' + row.url} />
          <span class="title">${row.title}</span>
          <span class="url">${row.url}</span>
        </a>
      </li>`

  const unpinnedBookmarks = bookmarks.filter(isNotPinned)
  return yo`
    <div class="bookmarks">
      ${unpinnedBookmarks.length ? unpinnedBookmarks.map(renderRow) : 'All bookmarks are pinned'}
    </div>
  `
}

function renderPinnedBookmark (bookmark) {
  var { url, title } = bookmark
  var [r, g, b] = bookmark.dominantColor || [255, 255, 255]
  return yo`
    <a class="pinned-bookmark ${isManagingBookmarks ? 'nolink' : ''}" href=${isManagingBookmarks ? '' : url}>
      <div class="favicon-container" style="background: rgb(${r}, ${g}, ${b})">
        ${isManagingBookmarks ? yo`<a class="unpin" onclick=${e => unpinBookmark(e, bookmark)}><i class="fa fa-times"></i></a>` : ''}
        <img src=${'beaker-favicon:' + url} class="favicon"/>
      </div>
      <div class="title">${title}</div>
    </a>
  `
}

function renderReleaseNotes () {
  if (!showReleaseNotes) {
    return ''
  }
  return yo`
    <div class="alert alert__info alert__release-notes">
      <strong>Welcome to Beaker 0.6.1!</strong>
      New start page, Dat-DNS, and an improved bkr command-line.
      <a href="https://github.com/beakerbrowser/beaker/releases/tag/0.6.1">Learn more</a>
    </div>
  `
}

function renderError () {
  if (!error) {
    return ''
  }
  return yo`
    <div class="message error"><i class="fa fa-exclamation-triangle"></i> ${error}</div>
  `
}

// event handlers
// =

async function shareFiles () {
  // have user select file
  var paths = await beakerBrowser.showOpenDialog({
    title: 'Select your files',
    properties: ['openFile', 'openDirectory', 'multiSelections', 'showHiddenFiles']
  })
  if (!paths) {
    return
  }

  // create a new dat
  var d = new Date()
  var archive = await DatArchive.create({
    title: `Shared Files ${d.toLocaleDateString()}`,
    description: `Files shared on ${d.toLocaleString()}`
  })

  // import into the user profile
  await Promise.all(paths.map(src => 
    DatArchive.importFromFilesystem({src, dst: archive.url, inplaceImport: true})
  ))

  // open
  window.location = archive.url
}

function toggleShelf () {
  isShelfOpen = !isShelfOpen
  update()
}

async function createSite () {
  var archive = await beaker.archives.create()
  window.location = 'beaker://editor/' + archive.url.slice('dat://'.length)
}

function onMouseOutShelf (e) {
  if (!findParent(e.relatedTarget, 'shelf')) {
    isShelfOpen = false
    update()
  }
}

function toggleAddPin (url, title) {
  isManagingBookmarks = !isManagingBookmarks
  update()
}

async function pinBookmark (e, {url}) {
  e.preventDefault()
  e.stopPropagation()

  await beaker.bookmarks.togglePinned(url, true)
  await loadBookmarks()
  update()
}

async function unpinBookmark (e, {url}) {
  e.preventDefault()
  e.stopPropagation()

  await beaker.bookmarks.togglePinned(url, false)
  await loadBookmarks()
  update()
}

// helpers
// =

async function loadBookmarks () {
  bookmarks = (await beaker.bookmarks.list()) || []
  pinnedBookmarks = (await beaker.bookmarks.list({pinned: true})) || []
  
  // load dominant colors of each pinned bookmark
  await Promise.all(pinnedBookmarks.map(attachDominantColor))
}

function attachDominantColor (bookmark) {
  return new Promise(resolve => {
    var img = new Image()
    img.setAttribute('crossOrigin', 'anonymous')
    img.onload = e => {
      var c = colorThief.getColor(img, 10)
      c[0] = (c[0] / 4)|0 + 192
      c[1] = (c[1] / 4)|0 + 192
      c[2] = (c[2] / 4)|0 + 192
      bookmark.dominantColor = c
      resolve()
    }
    img.onerror = resolve
    img.src = 'beaker-favicon:' + bookmark.url
  })
}

function niceName (archiveInfo) {
  return (archiveInfo.title || '').trim() || 'Untitled'
}
