/* ============================
   FIREBASE INIT
============================ */

const firebaseConfig = {
  apiKey: "AIzaSyBi-PMbrCNrID4Sci2DYj7l6ewQaxIqJ4k",
  authDomain: "ubgpro.firebaseapp.com",
  projectId: "ubgpro",
  storageBucket: "ubgpro.firebasestorage.app",
  messagingSenderId: "915266692059",
  appId: "1:915266692059:web:699879598f8d9ad96cbdfe",
  measurementId: "G-GCJ09MMXEQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

/* ============================
   USERNAME + PASSWORD SYSTEM
============================ */

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

// REGISTER USER
async function register(username, password) {
  username = username.toLowerCase();

  if (!isValidUsername(username)) {
    alert("Username must be 3–16 characters, letters/numbers/underscores only");
    return;
  }

  // Check duplicate username
  const userDoc = await db.collection("users").doc(username).get();
  if (userDoc.exists) {
    alert("Username already taken");
    return;
  }

  const fakeEmail = `${username}@chatapp.local`;

  // Create Firebase Auth user
  const userCred = await auth.createUserWithEmailAndPassword(fakeEmail, password);

  // Save username in Firestore
  await db.collection("users").doc(username).set({
    uid: userCred.user.uid,
    username,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Account created");
}

// LOGIN USER
async function login(username, password) {
  username = username.toLowerCase();
  const fakeEmail = `${username}@chatapp.local`;

  try {
    await auth.signInWithEmailAndPassword(fakeEmail, password);
    alert("Logged in");
  } catch (err) {
    alert("Invalid username or password");
  }
}

// GET CURRENT USERNAME
async function getCurrentUsername() {
  const uid = auth.currentUser.uid;

  const snap = await db.collection("users")
    .where("uid", "==", uid)
    .limit(1)
    .get();

  if (!snap.empty) {
    return snap.docs[0].data().username;
  }

  return null;
}

/* ============================
   UI ELEMENTS
============================ */

const serverList = document.getElementById("serverList");
const channelList = document.getElementById("channelList");
const messagesDiv = document.getElementById("messages");
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const addServerBtn = document.getElementById("addServerBtn");

let currentServer = null;
let currentChannel = null;

/* ============================
   SERVER SYSTEM
============================ */

// Load servers in real time
db.collection("servers").onSnapshot(snapshot => {
  serverList.innerHTML = "";
  snapshot.forEach(doc => {
    const data = doc.data();

    const icon = document.createElement("div");
    icon.className = "server-icon";
    icon.style.background = data.color;
    icon.textContent = data.name[0].toUpperCase();

    icon.onclick = () => loadServer(doc.id);

    serverList.appendChild(icon);
  });
});

// Create a new server
addServerBtn.onclick = async () => {
  const name = prompt("Server name:");
  if (!name) return;

  const color = "#18181b"; // dark neutral

  await db.collection("servers").add({
    name,
    color
  });
};

/* ============================
   CHANNEL SYSTEM
============================ */

async function loadServer(id) {
  currentServer = id;

  db.collection("servers")
    .doc(id)
    .collection("channels")
    .onSnapshot(snapshot => {
      channelList.innerHTML = "";
      snapshot.forEach(doc => {
        const li = document.createElement("li");
        li.className = "channel";
        li.textContent = "#" + doc.data().name;

        li.onclick = () => loadChannel(doc.id, doc.data().name);

        channelList.appendChild(li);
      });
    });
}

/* ============================
   MESSAGE SYSTEM
============================ */

function loadChannel(id, name) {
  currentChannel = id;
  document.getElementById("currentChannelName").textContent = "#" + name;

  db.collection("servers")
    .doc(currentServer)
    .collection("channels")
    .doc(id)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      messagesDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = "message";

        div.innerHTML = `
          <div class="message-body">
            <div class="message-text">${msg.text}</div>
          </div>
        `;

        messagesDiv.appendChild(div);
      });

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Send message
sendBtn.onclick = sendMessage;
messageInput.onkeydown = e => {
  if (e.key === "Enter") sendMessage();
};

async function sendMessage() {
  if (!currentChannel || !messageInput.value.trim()) return;

  const username = await getCurrentUsername();

  db.collection("servers")
    .doc(currentServer)
    .collection("channels")
    .doc(currentChannel)
    .collection("messages")
    .add({
      text: messageInput.value,
      username,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

  messageInput.value = "";
}
