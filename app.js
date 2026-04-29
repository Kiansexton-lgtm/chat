// ---------- Firebase init ----------
const firebaseConfig = {
  apiKey: "AIzaSyBi-PMbrCNrID4Sci2DYj7l6ewQaxIqJ4k",
  authDomain: "ubgpro.firebaseapp.com",
  projectId: "ubgpro",
  storageBucket: "ubgpro.firebasestorage.app",
  messagingSenderId: "915266692059",
  appId: "1:915266692059:web:699879598f8d9ad96cbdfe",
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- DOM ----------
const authScreen = document.getElementById("auth-screen");
const appEl = document.getElementById("app");

// auth
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const regUsername = document.getElementById("reg-username");
const regEmail = document.getElementById("reg-email");
const regPassword = document.getElementById("reg-password");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

// main
const roomsList = document.getElementById("rooms-list");
const dmsList = document.getElementById("dms-list");
const friendsList = document.getElementById("friends-list");
const requestsList = document.getElementById("requests-list");
const createRoomBtn = document.getElementById("create-room-btn");
const logoutBtn = document.getElementById("logout-btn");
const roomTitle = document.getElementById("room-title");
const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const addFriendForm = document.getElementById("add-friend-form");
const addFriendInput = document.getElementById("add-friend-input");
const addFriendStatus = document.getElementById("add-friend-status");

// ---------- State ----------
let currentUser = null;
let currentProfile = null;
let currentRoomId = null;
let currentRoomIsDM = false;

let roomsUnsub = null;
let dmsUnsub = null;
let friendsUnsub = null;
let requestsUnsub = null;
let messagesUnsub = null;

const profileCache = new Map();

// ---------- Helpers ----------
function randomTag() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function userDisplayName(profile) {
  return `${profile.username}#${profile.tag}`;
}

async function getUserProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const doc = await db.collection("users").doc(uid).get();
  const data = doc.exists
    ? doc.data()
    : { uid, username: "Unknown", tag: "0000" };
  profileCache.set(uid, data);
  return data;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function renderMessage(doc) {
  const data = doc.data();
  const row = document.createElement("div");
  row.classList.add("message");

  const header = document.createElement("div");
  header.classList.add("message-header");
  const date = data.createdAt?.toDate
    ? data.createdAt.toDate()
    : new Date();
  header.textContent = `${data.senderName || "Unknown"} • ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const text = document.createElement("div");
  text.classList.add("message-text");
  text.textContent = data.text || "";

  row.appendChild(header);
  row.appendChild(text);
  messagesEl.appendChild(row);
}

// ---------- Auth tabs ----------
loginTab.addEventListener("click", () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  loginError.textContent = "";
  registerError.textContent = "";
});

registerTab.addEventListener("click", () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  loginError.textContent = "";
  registerError.textContent = "";
});

// ---------- Auth flows ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  try {
    await auth.signInWithEmailAndPassword(
      loginEmail.value.trim(),
      loginPassword.value.trim()
    );
  } catch (err) {
    loginError.textContent = err.message;
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  const username = regUsername.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value.trim();

  if (!username) {
    registerError.textContent = "Username required.";
    return;
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    const tag = randomTag();
    await db.collection("users").doc(uid).set({
      uid,
      username,
      tag,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    registerError.textContent = err.message;
  }
});

// ---------- Auth state ----------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    currentProfile = null;
    authScreen.classList.remove("hidden");
    appEl.classList.add("hidden");
    cleanupSubs();
    return;
  }

  currentUser = user;
  await loadProfile();
  authScreen.classList.add("hidden");
  appEl.classList.remove("hidden");
  setupLists();
});

// load profile
async function loadProfile() {
  const doc = await db.collection("users").doc(currentUser.uid).get();
  if (!doc.exists) {
    const username = currentUser.email.split("@")[0];
    const tag = randomTag();
    await db.collection("users").doc(currentUser.uid).set({
      uid: currentUser.uid,
      username,
      tag,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    currentProfile = { uid: currentUser.uid, username, tag };
  } else {
    currentProfile = doc.data();
  }
}

// ---------- Subscriptions ----------
function cleanupSubs() {
  if (roomsUnsub) roomsUnsub();
  if (dmsUnsub) dmsUnsub();
  if (friendsUnsub) friendsUnsub();
  if (requestsUnsub) requestsUnsub();
  if (messagesUnsub) messagesUnsub();
}

function setupLists() {
  cleanupSubs();

  // channels
  roomsUnsub = db
    .collection("rooms")
    .where("members", "array-contains", currentUser.uid)
    .where("isDM", "==", false)
    .orderBy("createdAt", "asc")
    .onSnapshot((snap) => {
      roomsList.innerHTML = "";
      snap.forEach((doc) => {
        const data = doc.data();
        const item = document.createElement("div");
        item.classList.add("list-item");
        if (doc.id === currentRoomId) item.classList.add("active");
        item.textContent = `# ${data.name}`;
        item.addEventListener("click", () =>
          openRoom(doc.id, false, data.name)
        );
        roomsList.appendChild(item);
      });
    });

  // DMs
  dmsUnsub = db
    .collection("rooms")
    .where("members", "array-contains", currentUser.uid)
    .where("isDM", "==", true)
    .orderBy("createdAt", "asc")
    .onSnapshot((snap) => {
      dmsList.innerHTML = "";
      snap.forEach((doc) => {
        const data = doc.data();
        const item = document.createElement("div");
        item.classList.add("list-item");
        if (doc.id === currentRoomId) item.classList.add("active");
        item.textContent = data.dmName || "Direct Message";
        item.addEventListener("click", () =>
          openRoom(doc.id, true, data.dmName || "Direct Message")
        );
        dmsList.appendChild(item);
      });
    });

  // friends
  friendsUnsub = db
    .collection("friends")
    .where("participants", "array-contains", currentUser.uid)
    .where("status", "==", "accepted")
    .onSnapshot(async (snap) => {
      friendsList.innerHTML = "";
      for (const doc of snap.docs) {
        const data = doc.data();
        const friendId =
          data.userA === currentUser.uid ? data.userB : data.userA;
        const profile = await getUserProfile(friendId);
        const item = document.createElement("div");
        item.classList.add("list-item");
        item.textContent = userDisplayName(profile);
        item.addEventListener("click", () => openOrCreateDM(friendId, profile));
        friendsList.appendChild(item);
      }
    });

  // requests
  requestsUnsub = db
    .collection("friends")
    .where("userB", "==", currentUser.uid)
    .where("status", "==", "pending")
    .onSnapshot(async (snap) => {
      requestsList.innerHTML = "";
      for (const doc of snap.docs) {
        const data = doc.data();
        const fromProfile = await getUserProfile(data.userA);
        const row = document.createElement("div");
        row.classList.add("list-item");
        row.textContent = userDisplayName(fromProfile);

        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";
        acceptBtn.style.marginLeft = "6px";
        acceptBtn.addEventListener("click", () =>
          respondToRequest(doc.id, true)
        );

        const declineBtn = document.createElement("button");
        declineBtn.textContent = "X";
        declineBtn.style.marginLeft = "4px";
        declineBtn.addEventListener("click", () =>
          respondToRequest(doc.id, false)
        );

        row.appendChild(acceptBtn);
        row.appendChild(declineBtn);
        requestsList.appendChild(row);
      }
    });
}

// ---------- Rooms & messages ----------
async function openRoom(roomId, isDM, title) {
  currentRoomId = roomId;
  currentRoomIsDM = isDM;
  roomTitle.textContent = title;

  if (messagesUnsub) messagesUnsub();
  clearMessages();

  messagesUnsub = db
    .collection("rooms")
    .doc(roomId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(200)
    .onSnapshot((snap) => {
      clearMessages();
      snap.forEach((doc) => renderMessage(doc));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

  document.querySelectorAll(".list-item").forEach((el) =>
    el.classList.remove("active")
  );
}

createRoomBtn.addEventListener("click", async () => {
  const name = prompt("Channel name:");
  if (!name) return;
  try {
    const ref = await db.collection("rooms").add({
      name,
      isDM: false,
      members: [currentUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    openRoom(ref.id, false, `# ${name}`);
  } catch (err) {
    console.error("Error creating room:", err);
  }
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentRoomId || !currentProfile) return;
  messageInput.value = "";
  messageInput.focus();

  try {
    await db
      .collection("rooms")
      .doc(currentRoomId)
      .collection("messages")
      .add({
        text,
        senderId: currentUser.uid,
        senderName: userDisplayName(currentProfile),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("Error sending message:", err);
  }
});

// ---------- Friends ----------
addFriendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addFriendStatus.textContent = "";
  const value = addFriendInput.value.trim();
  if (!value) return;

  const [username, tag] = value.split("#");
  if (!username || !tag) {
    addFriendStatus.textContent = "Use username#tag";
    return;
  }

  try {
    const snap = await db
      .collection("users")
      .where("username", "==", username)
      .where("tag", "==", tag)
      .limit(1)
      .get();

    if (snap.empty) {
      addFriendStatus.textContent = "User not found.";
      return;
    }

    const target = snap.docs[0].data();
    if (target.uid === currentUser.uid) {
      addFriendStatus.textContent = "You can't add yourself.";
      return;
    }

    const existing = await db
      .collection("friends")
      .where("participants", "array-contains", currentUser.uid)
      .get();

    const already = existing.docs.find((doc) => {
      const d = doc.data();
      return (
        (d.userA === currentUser.uid && d.userB === target.uid) ||
        (d.userB === currentUser.uid && d.userA === currentUser.uid)
      );
    });

    if (already) {
      addFriendStatus.textContent = "Already friends or pending.";
      return;
    }

    await db.collection("friends").add({
      userA: currentUser.uid,
      userB: target.uid,
      participants: [currentUser.uid, target.uid],
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    addFriendStatus.textContent = "Request sent.";
    addFriendInput.value = "";
  } catch (err) {
    console.error(err);
    addFriendStatus.textContent = "Error sending request.";
  }
});

async function respondToRequest(id, accept) {
  try {
    const ref = db.collection("friends").doc(id);
    if (accept) {
      await ref.update({ status: "accepted" });
    } else {
      await ref.delete();
    }
  } catch (err) {
    console.error("Error updating request:", err);
  }
}

// ---------- DMs ----------
async function openOrCreateDM(friendId, friendProfile) {
  const snap = await db
    .collection("rooms")
    .where("isDM", "==", true)
    .where("members", "array-contains", currentUser.uid)
    .get();

  let existing = null;
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.members.includes(friendId)) {
      existing = { id: doc.id, data };
    }
  });

  if (existing) {
    openRoom(existing.id, true, existing.data.dmName || "Direct Message");
    return;
  }

  const dmName = userDisplayName(friendProfile);
  const ref = await db.collection("rooms").add({
    isDM: true,
    members: [currentUser.uid, friendId],
    dmName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  openRoom(ref.id, true, dmName);
}

// ---------- Logout ----------
logoutBtn.addEventListener("click", () => {
  auth.signOut();
});
