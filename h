// ---------- Firebase init (your config) ----------
const firebaseConfig = {
  apiKey: "AIzaSyBi-PMbrCNrID4Sci2DYj7l6ewQaxIqJ4k",
  authDomain: "ubgpro.firebaseapp.com",
  projectId: "ubgpro",
  storageBucket: "ubgpro.firebasestorage.app",
  messagingSenderId: "915266692059",
  appId: "1:915266692059:web:699879598f8d9ad96cbdfe",
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---------- DOM refs ----------
const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const regUsername = document.getElementById('reg-username');
const regPassword = document.getElementById('reg-password');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

const channelsEl = document.getElementById('channels');
const dmsEl = document.getElementById('dms');
const friendsEl = document.getElementById('friends');
const requestsEl = document.getElementById('requests');

const btnNewChannel = document.getElementById('btn-new-channel');
const btnLogout = document.getElementById('btn-logout');
const roomTitle = document.getElementById('room-title');
const roomSub = document.getElementById('room-sub');
const meLabel = document.getElementById('me-label');

const messagesEl = document.getElementById('messages');
const formMessage = document.getElementById('form-message');
const inputMessage = document.getElementById('input-message');
const btnSend = document.getElementById('btn-send');

const formAddFriend = document.getElementById('form-add-friend');
const inputAddFriend = document.getElementById('input-add-friend');
const addFriendStatus = document.getElementById('add-friend-status');

// ---------- state ----------
let meUid = localStorage.getItem('nc_uid') || null;
let myProfile = null;
let currentRoom = null;
let messagesUnsub = null;
let listUnsubs = [];
const profileCache = new Map();

// ---------- crypto helper (SHA-256 -> hex) ----------
async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- small helpers ----------
const randomTag = () => Math.floor(1000 + Math.random() * 9000).toString();
const displayName = p => `${p.username}#${p.tag}`;
function makeListItem(text, id) {
  const el = document.createElement('div');
  el.className = 'list-item';
  el.dataset.id = id || '';
  el.textContent = text;
  return el;
}
function clearMessages() { messagesEl.innerHTML = ''; }
function setRoomHeader(title, sub) { roomTitle.textContent = title; roomSub.textContent = sub || ''; }
function setActive(containerId, id) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.list-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
}

// ---------- profile cache ----------
async function getProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const doc = await db.collection('users').doc(uid).get();
  const data = doc.exists ? doc.data() : { uid, username: 'unknown', tag: '0000' };
  profileCache.set(uid, data);
  return data;
}

// ---------- UI: auth tab switching ----------
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active'); tabRegister.classList.remove('active');
  formLogin.classList.remove('hidden'); formRegister.classList.add('hidden');
  loginError.textContent = ''; registerError.textContent = '';
});
tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active'); tabLogin.classList.remove('active');
  formRegister.classList.remove('hidden'); formLogin.classList.add('hidden');
  loginError.textContent = ''; registerError.textContent = '';
});

// ---------- register (username + password) ----------
formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const username = regUsername.value.trim();
  const password = regPassword.value;

  if (!username) { registerError.textContent = 'Choose a username'; return; }
  if (!password || password.length < 6) { registerError.textContent = 'Password must be at least 6 characters'; return; }

  try {
    // check username uniqueness
    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!snap.empty) { registerError.textContent = 'Username already taken'; return; }

    const tag = randomTag();
    const passwordHash = await sha256Hex(password);

    // create user doc with generated id
    const newRef = db.collection('users').doc();
    const uid = newRef.id;
    await newRef.set({
      uid,
      username,
      tag,
      passwordHash,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // set session
    localStorage.setItem('nc_uid', uid);
    meUid = uid;
    await loadProfileAndStart();
  } catch (err) {
    console.error('register error', err);
    registerError.textContent = 'Registration failed';
  }
});

// ---------- login (username + password) ----------
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  if (!username || !password) { loginError.textContent = 'Enter username and password'; return; }

  try {
    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snap.empty) { loginError.textContent = 'Invalid credentials'; return; }
    const doc = snap.docs[0];
    const data = doc.data();
    const hash = await sha256Hex(password);
    if (hash !== data.passwordHash) { loginError.textContent = 'Invalid credentials'; return; }

    // success
    localStorage.setItem('nc_uid', data.uid);
    meUid = data.uid;
    await loadProfileAndStart();
  } catch (err) {
    console.error('login error', err);
    loginError.textContent = 'Login failed';
  }
});

// ---------- load profile and start app ----------
async function loadProfileAndStart() {
  if (!meUid) return;
  const doc = await db.collection('users').doc(meUid).get();
  if (!doc.exists) {
    // session invalid
    localStorage.removeItem('nc_uid');
    meUid = null;
    return;
  }
  myProfile = doc.data();
  profileCache.set(myProfile.uid, myProfile);

  // show app
  authScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  appRoot.removeAttribute('aria-hidden');
  meLabel.textContent = displayName(myProfile);

  // setup realtime lists
  setupRealtimeLists();
}

// ---------- realtime lists ----------
function cleanupListUnsubs() {
  listUnsubs.forEach(u => u && u());
  listUnsubs = [];
}
function setupRealtimeLists() {
  cleanupListUnsubs();

  // channels (rooms where isDM == false and members contains me)
  const roomsQ = db.collection('rooms')
    .where('isDM', '==', false)
    .where('members', 'array-contains', meUid)
    .orderBy('createdAt', 'asc');

  const roomsUnsub = roomsQ.onSnapshot(snap => {
    channelsEl.innerHTML = '';
    snap.forEach(doc => {
      const data = doc.data();
      const item = makeListItem(`# ${data.name}`, doc.id);
      item.addEventListener('click', () => openRoom(doc.id, false, data.name));
      channelsEl.appendChild(item);
    });
    setActive('channels', currentRoom ? currentRoom.id : null);
  });
  listUnsubs.push(roomsUnsub);

  // DMs
  const dmsQ = db.collection('rooms')
    .where('isDM', '==', true)
    .where('members', 'array-contains', meUid)
    .orderBy('createdAt', 'asc');

  const dmsUnsub = dmsQ.onSnapshot(async snap => {
    dmsEl.innerHTML = '';
    for (const doc of snap.docs) {
      const data = doc.data();
      const other = (data.members || []).find(m => m !== meUid) || null;
      const name = data.dmName || (other ? (await getProfile(other)).username : 'DM');
      const item = makeListItem(name, doc.id);
      item.addEventListener('click', () => openRoom(doc.id, true, name));
      dmsEl.appendChild(item);
    }
    setActive('dms', currentRoom ? currentRoom.id : null);
  });
  listUnsubs.push(dmsUnsub);

  // friends (accepted)
  const friendsQ = db.collection('friends')
    .where('participants', 'array-contains', meUid)
    .where('status', '==', 'accepted');

  const friendsUnsub = friendsQ.onSnapshot(async snap => {
    friendsEl.innerHTML = '';
    for (const doc of snap.docs) {
      const d = doc.data();
      const friendId = d.userA === meUid ? d.userB : d.userA;
      const p = await getProfile(friendId);
      const item = makeListItem(displayName(p), doc.id);
      item.addEventListener('click', () => openOrCreateDM(friendId, p));
      friendsEl.appendChild(item);
    }
  });
  listUnsubs.push(friendsUnsub);

  // incoming friend requests
  const reqQ = db.collection('friends')
    .where('userB', '==', meUid)
    .where('status', '==', 'pending');

  const reqUnsub = reqQ.onSnapshot(async snap => {
    requestsEl.innerHTML = '';
    for (const doc of snap.docs) {
      const d = doc.data();
      const from = await getProfile(d.userA);
      const row = document.createElement('div');
      row.className = 'list-item';
      row.textContent = displayName(from);

      const accept = document.createElement('button');
      accept.className = 'btn';
      accept.textContent = 'Accept';
      accept.addEventListener('click', () => respondRequest(doc.id, true));

      const decline = document.createElement('button');
      decline.className = 'btn';
      decline.textContent = 'Decline';
      decline.addEventListener('click', () => respondRequest(doc.id, false));

      row.appendChild(accept);
      row.appendChild(decline);
      requestsEl.appendChild(row);
    }
  });
  listUnsubs.push(reqUnsub);
}

// ---------- open room & messages ----------
async function openRoom(roomId, isDM, title) {
  if (currentRoom && currentRoom.id === roomId) return;
  if (messagesUnsub) messagesUnsub();

  currentRoom = { id: roomId, isDM, title };
  setRoomHeader(isDM ? title : `# ${title}`, isDM ? 'Direct message' : 'Channel');
  setActive('channels', roomId);
  setActive('dms', roomId);
  clearMessages();

  const messagesRef = db.collection('rooms').doc(roomId).collection('messages')
    .orderBy('createdAt', 'asc').limit(500);

  messagesUnsub = messagesRef.onSnapshot(snap => {
    clearMessages();
    snap.forEach(doc => {
      const data = doc.data();
      const el = document.createElement('div');
      el.className = 'message';
      const header = document.createElement('div');
      header.className = 'message-header';
      header.textContent = `${data.senderName || 'unknown'} • ${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}`;
      const body = document.createElement('div');
      body.className = 'message-text';
      body.textContent = data.text || '';
      el.appendChild(header); el.appendChild(body);
      messagesEl.appendChild(el);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ---------- create channel ----------
btnNewChannel.addEventListener('click', async () => {
  const name = prompt('Channel name');
  if (!name) return;
  try {
    const ref = await db.collection('rooms').add({
      name,
      isDM: false,
      members: [meUid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    openRoom(ref.id, false, name);
  } catch (err) {
    console.error('create channel', err);
    alert('Could not create channel');
  }
});

// ---------- send message ----------
formMessage.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentRoom || !inputMessage.value.trim()) return;
  const text = inputMessage.value.trim();
  inputMessage.value = '';
  btnSend.disabled = true;
  try {
    await db.collection('rooms').doc(currentRoom.id).collection('messages').add({
      text,
      senderId: meUid,
      senderName: displayName(myProfile),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('send message', err);
  } finally {
    btnSend.disabled = false;
  }
});

// ---------- add friend ----------
formAddFriend.addEventListener('submit', async (e) => {
  e.preventDefault();
  addFriendStatus.textContent = '';
  const raw = inputAddFriend.value.trim();
  if (!raw) return;
  const parts = raw.split('#');
  if (parts.length !== 2) { addFriendStatus.textContent = 'Use username#tag'; return; }
  const [username, tag] = parts.map(s => s.trim());
  try {
    const snap = await db.collection('users').where('username', '==', username).where('tag', '==', tag).limit(1).get();
    if (snap.empty) { addFriendStatus.textContent = 'User not found'; return; }
    const target = snap.docs[0].data();
    if (target.uid === meUid) { addFriendStatus.textContent = "You can't add yourself"; return; }

    // check existing friend doc between the two
    const existing = await db.collection('friends')
      .where('participants', 'array-contains', meUid)
      .get();

    const already = existing.docs.find(d => {
      const data = d.data();
      return (data.userA === meUid && data.userB === target.uid) || (data.userB === meUid && data.userA === target.uid);
    });

    if (already) { addFriendStatus.textContent = 'Already friends or pending'; return; }

    await db.collection('friends').add({
      userA: meUid,
      userB: target.uid,
      participants: [meUid, target.uid],
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    addFriendStatus.textContent = 'Request sent';
    inputAddFriend.value = '';
  } catch (err) {
    console.error('add friend', err);
    addFriendStatus.textContent = 'Error sending request';
  }
});

// ---------- respond to request ----------
async function respondRequest(docId, accept) {
  try {
    const ref = db.collection('friends').doc(docId);
    if (accept) await ref.update({ status: 'accepted' });
    else await ref.delete();
  } catch (err) { console.error('respond request', err); }
}

// ---------- open or create DM ----------
async function openOrCreateDM(friendId, friendProfile) {
  const snap = await db.collection('rooms')
    .where('isDM', '==', true)
    .where('members', 'array-contains', meUid)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const members = data.members || [];
    if (members.length === 2 && members.includes(friendId) && members.includes(meUid)) {
      openRoom(doc.id, true, data.dmName || displayName(friendProfile));
      return;
    }
  }

  const dmName = displayName(friendProfile);
  const ref = await db.collection('rooms').add({
    isDM: true,
    members: [meUid, friendId],
    dmName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  openRoom(ref.id, true, dmName);
}

// ---------- logout ----------
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('nc_uid');
  meUid = null;
  myProfile = null;
  currentRoom = null;
  if (messagesUnsub) messagesUnsub();
  cleanupListUnsubs();
  authScreen.classList.remove('hidden');
  appRoot.classList.add('hidden');
  appRoot.setAttribute('aria-hidden','true');
});

// ---------- utility: click friend list to open DM ----------
friendsEl.addEventListener('click', async e => {
  const item = e.target.closest('.list-item');
  if (!item) return;
  const friendDocId = item.dataset.id;
  try {
    const doc = await db.collection('friends').doc(friendDocId).get();
    if (!doc.exists) return;
    const data = doc.data();
    const friendId = data.userA === meUid ? data.userB : data.userA;
    const profile = await getProfile(friendId);
    openOrCreateDM(friendId, profile);
  } catch (err) { console.error(err); }
});

// ---------- startup: if session exists, load profile ----------
(async function init() {
  if (meUid) {
    try { await loadProfileAndStart(); }
    catch (err) { console.warn('session load failed', err); localStorage.removeItem('nc_uid'); meUid = null; }
  }
})();
