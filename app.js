// --- Firebase init (your config) ---
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

// --- DOM refs ---
const authScreen = document.getElementById("auth-screen");
const mainApp = document.getElementById("main-app");

// Auth tabs
const loginTab = document.getElementById("auth-login-tab");
const registerTab = document.getElementById("auth-register-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginErrorEl = document.getElementById("login-error");
const registerErrorEl = document.getElementById("register-error");

// Login inputs
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");

// Register inputs
const registerUsernameInput = document.getElementById("register-username");
const registerEmailInput = document.getElementById("register-email");
const registerPasswordInput = document.getElementById("register-password");

// Main UI
const roomsListEl = document.getElementById("rooms-list");
const dmsListEl = document.getElementById("dms-list");
const friendsListEl = document.getElementById("friends-list");
const friendRequestsListEl = document.getElementById("friend-requests-list");
const createRoomBtn = document.getElementById("create-room-btn");
const logoutBtn = document.getElementById("logout-btn");
const currentUserLabelEl = document.getElementById("current-user-label");
const currentRoomNameEl = document.getElementById("current-room-name");
const currentRoomMetaEl = document.getElementById("current-room-meta");

const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

// Add friend
const addFriendForm = document.getElementById("add-friend-form");
const addFriendInput = document.getElementById("add-friend-input");
const addFriendStatusEl = document.getElementById("add-friend-status");

// --- State ---
let currentUser = null; // Firebase user
let currentUserProfile = null; // {uid, username, tag}
let currentRoomId = null;
let currentRoomUnsub = null;
let roomsUnsub = null;
let dmsUnsub = null;
let friendsUnsub = null;
let requestsUnsub = null;

// --- Helpers ---

function randomTag() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function userDisplayName(profile) {
  return `${profile.username}#${profile.tag}`;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function renderMessage(doc) {
  const data = doc.data();
  const isSelf = data.senderId === currentUser.uid;

  const row = document.createElement("div");
  row.classList.add("message-row");
  if (isSelf) row.classList.add("self");

  const avatar = document.createElement("div");
  avatar.classList.add("message-avatar");
  avatar.textContent = (data.senderName || "?")[0]?.toUpperCase() || "?";

  const content = document.createElement("div");
  content.classList.add("message-content");

  const header = document.createElement("div");
  header.classList.add("message-header");

  const usernameEl = document.createElement("span");
  usernameEl.classList.add("message-username");
  usernameEl.textContent = data.senderName || "Unknown";

  const tsEl = document.createElement("span");
  tsEl.classList.add("message-timestamp");
  const date = data.createdAt?.toDate
    ? data.createdAt.toDate()
    : new Date();
  tsEl.textContent = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  header.appendChild(usernameEl);
  header.appendChild(tsEl);

  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");
  bubble.textContent = data.text || "";

  content.appendChild(header);
  content.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(content);

  messagesEl.appendChild(row);
}

// --- Auth tab switching ---

loginTab.addEventListener("click", () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  loginErrorEl.textContent = "";
  registerErrorEl.textContent = "";
});

registerTab.addEventListener("click", () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  loginErrorEl.textContent = "";
  registerErrorEl.textContent = "";
});

// --- Auth flows ---

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErrorEl.textContent = "";
  try {
    await auth.signInWithEmailAndPassword(
      loginEmailInput.value.trim(),
      loginPasswordInput.value.trim()
    );
  } catch (err) {
    console.error(err);
    loginErrorEl.textContent = err.message;
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerErrorEl.textContent = "";
  const username = registerUsernameInput.value.trim();
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value.trim();

  if (!username) {
    registerErrorEl.textContent = "Username is required.";
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
    console.error(err);
    registerErrorEl.textContent = err.message;
  }
});

// --- Auth state listener ---

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    currentUserProfile = null;
    authScreen.classList.remove("hidden");
    mainApp.classList.add("hidden");
    cleanupSubscriptions();
    return;
  }

  currentUser = user;
  await loadCurrentUserProfile();
  authScreen.classList.add("hidden");
  mainApp.classList.remove("hidden");
  currentUserLabelEl.textContent = currentUserProfile
    ? userDisplayName(currentUserProfile)
    : user.email;

  setupRealtimeLists();
});

// --- Load current user profile ---

async function loadCurrentUserProfile() {
  const doc = await db.collection("users").doc(currentUser.uid).get();
  if (!doc.exists) {
    // Fallback profile if user existed before profile system
    const username = currentUser.email.split("@")[0];
    const tag = randomTag();
    await db.collection("users").doc(currentUser.uid).set({
      uid: currentUser.uid,
      username,
      tag,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    currentUserProfile = { uid: currentUser.uid, username, tag };
  } else {
    currentUserProfile = doc.data();
  }
}

// --- Subscriptions ---

function cleanupSubscriptions() {
  if (roomsUnsub) roomsUnsub();
  if (dmsUnsub) dmsUnsub();
  if (friendsUnsub) friendsUnsub();
  if (requestsUnsub) requestsUnsub();
  if (currentRoomUnsub) currentRoomUnsub();
}

function setupRealtimeLists() {
  // Rooms where user is a member and isDM == false
  roomsUnsub = db
    .collection("rooms")
    .where("members", "array-contains", currentUser.uid)
    .where("isDM", "==", false)
    .orderBy("createdAt", "asc")
    .onSnapshot((snap) => {
      roomsListEl.innerHTML = "";
      snap.forEach((doc) => {
        const data = doc.data();
        const item = document.createElement("div");
        item.classList.add("sidebar-item");
        if (doc.id === currentRoomId) item.classList.add("active");
        item.innerHTML = `<span># ${data.name}</span>`;
        item.addEventListener("click", () => openRoom(doc.id, data));
        roomsListEl.appendChild(item);
      });
    });

  // DMs: rooms where isDM == true
  dmsUnsub = db
    .collection("rooms")
    .where("members", "array-contains", currentUser.uid)
    .where("isDM", "==", true)
    .orderBy("createdAt", "asc")
    .onSnapshot((snap) => {
      dmsListEl.innerHTML = "";
      snap.forEach((doc) => {
        const data = doc.data();
        const otherMember = (data.members || []).find(
          (m) => m !== currentUser.uid
        );
        const item = document.createElement("div");
        item.classList.add("sidebar-item");
        if (doc.id === currentRoomId) item.classList.add("active");
        item.innerHTML = `<span>@ ${data.dmName || "DM"}</span>`;
        item.addEventListener("click", () => openRoom(doc.id, data));
        dmsListEl.appendChild(item);
      });
    });

  // Friends
  friendsUnsub = db
    .collection("friends")
    .where("participants", "array-contains", currentUser.uid)
    .where("status", "==", "accepted")
    .onSnapshot(async (snap) => {
      friendsListEl.innerHTML = "";
      for (const doc of snap.docs) {
        const data = doc.data();
        const friendId =
          data.userA === currentUser.uid ? data.userB : data.userA;
        const friendProfile = await getUserProfile(friendId);
        const item = document.createElement("div");
        item.classList.add("friend-item");
        item.innerHTML = `
          <span>${userDisplayName(friendProfile)}</span>
        `;
        const dmBtn = document.createElement("button");
        dmBtn.textContent = "Message";
        dmBtn.addEventListener("click", () =>
          openOrCreateDM(friendId, friendProfile)
        );
        item.appendChild(dmBtn);
        friendsListEl.appendChild(item);
      }
    });

  // Friend requests (incoming)
  requestsUnsub = db
    .collection("friends")
    .where("userB", "==", currentUser.uid)
    .where("status", "==", "pending")
    .onSnapshot(async (snap) => {
      friendRequestsListEl.innerHTML = "";
      for (const doc of snap.docs) {
        const data = doc.data();
        const fromProfile = await getUserProfile(data.userA);
        const item = document.createElement("div");
        item.classList.add("request-item");
        const label = document.createElement("span");
        label.textContent = `${userDisplayName(fromProfile)}`;
        item.appendChild(label);

        const actions = document.createElement("div");
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";
        acceptBtn.classList.add("accept");
        acceptBtn.addEventListener("click", () =>
          respondToFriendRequest(doc.id, true)
        );

        const declineBtn = document.createElement("button");
        declineBtn.textContent = "Decline";
        declineBtn.classList.add("decline");
        declineBtn.addEventListener("click", () =>
          respondToFriendRequest(doc.id, false)
        );

        actions.appendChild(acceptBtn);
        actions.appendChild(declineBtn);
        item.appendChild(actions);

        friendRequestsListEl.appendChild(item);
      }
    });
}

// --- User profile cache ---

const userProfileCache = new Map();

async function getUserProfile(uid) {
  if (userProfileCache.has(uid)) return userProfileCache.get(uid);
  const doc = await db.collection("users").doc(uid).get();
  const data = doc.exists
    ? doc.data()
    : { uid, username: "Unknown", tag: "0000" };
  userProfileCache.set(uid, data);
  return data;
}

// --- Rooms & messages ---

async function openRoom(roomId, roomData) {
  currentRoomId = roomId;
  currentRoomNameEl.textContent = roomData.isDM
    ? roomData.dmName || "Direct Message"
    : `# ${roomData.name}`;
  currentRoomMetaEl.textContent = roomData.isDM
    ? "Direct message"
    : "Room chat";

  if (currentRoomUnsub) currentRoomUnsub();
  clearMessages();

  currentRoomUnsub = db
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

  // Update active state in sidebars
  document.querySelectorAll(".sidebar-item").forEach((el) => {
    el.classList.remove("active");
  });
  // naive: re-run lists will mark active via openRoom call
}

// Create room
createRoomBtn.addEventListener("click", async () => {
  const name = prompt("Room name:");
  if (!name) return;
  try {
    const ref = await db.collection("rooms").add({
      name,
      ownerId: currentUser.uid,
      members: [currentUser.uid],
      isDM: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // auto-open
    openRoom(ref.id, {
      name,
      ownerId: currentUser.uid,
      members: [currentUser.uid],
      isDM: false,
    });
  } catch (err) {
    console.error("Error creating room:", err);
  }
});

// Send message
messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentRoomId || !currentUserProfile) return;
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
        senderName: userDisplayName(currentUserProfile),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("Error sending message:", err);
  }
});

// --- Friends system ---

addFriendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addFriendStatusEl.textContent = "";
  const value = addFriendInput.value.trim();
  if (!value) return;

  const [username, tag] = value.split("#");
  if (!username || !tag) {
    addFriendStatusEl.textContent = "Use format username#tag";
    return;
  }

  try {
    const userSnap = await db
      .collection("users")
      .where("username", "==", username)
      .where("tag", "==", tag)
      .limit(1)
      .get();

    if (userSnap.empty) {
      addFriendStatusEl.textContent = "User not found.";
      return;
    }

    const target = userSnap.docs[0].data();
    if (target.uid === currentUser.uid) {
      addFriendStatusEl.textContent = "You can't add yourself.";
      return;
    }

    // Check existing relationship
    const existing = await db
      .collection("friends")
      .where("participants", "array-contains", currentUser.uid)
      .get();

    const already = existing.docs.find((doc) => {
      const d = doc.data();
      return (
        (d.userA === currentUser.uid && d.userB === target.uid) ||
        (d.userB === currentUser.uid && d.userA === target.uid)
      );
    });

    if (already) {
      addFriendStatusEl.textContent = "Friend request already exists or you're already friends.";
      return;
    }

    await db.collection("friends").add({
      userA: currentUser.uid,
      userB: target.uid,
      participants: [currentUser.uid, target.uid],
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    addFriendStatusEl.textContent = "Friend request sent.";
    addFriendInput.value = "";
  } catch (err) {
    console.error(err);
    addFriendStatusEl.textContent = "Error sending request.";
  }
});

async function respondToFriendRequest(requestId, accept) {
  try {
    const ref = db.collection("friends").doc(requestId);
    if (accept) {
      await ref.update({ status: "accepted" });
    } else {
      await ref.delete();
    }
  } catch (err) {
    console.error("Error responding to request:", err);
  }
}

// --- DMs ---

async function openOrCreateDM(friendId, friendProfile) {
  // Try to find existing DM room
  const snap = await db
    .collection("rooms")
    .where("isDM", "==", true)
    .where("members", "array-contains", currentUser.uid)
    .get();

  let existing = null;
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.members.includes(friendId)) existing = { id: doc.id, data };
  });

  if (existing) {
    openRoom(existing.id, existing.data);
    return;
  }

  // Create new DM room
  const dmName = `${userDisplayName(friendProfile)}`;
  const ref = await db.collection("rooms").add({
    isDM: true,
    members: [currentUser.uid, friendId],
    dmName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  openRoom(ref.id, {
    isDM: true,
    members: [currentUser.uid, friendId],
    dmName,
  });
}

// --- Logout ---

logoutBtn.addEventListener("click", () => {
  auth.signOut();
});
