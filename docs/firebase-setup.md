# Firebase Setup & Security Rules Guide
### Configured for Project: `ration-system-877e4`

This project is fully wired with your Firebase credentials:
- **Project ID**: `ration-system-877e4`
- **Auth Domain**: `ration-system-877e4.firebaseapp.com`
- **Database URL**: `https://ration-system-877e4-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Storage Bucket**: `ration-system-877e4.firebasestorage.app`
- **Web App ID**: `1:803105490911:web:4a91456b594dc4653c666a`
- **Measurement ID**: `G-BQ19ND2E46`

---

## 1. How to Deploy the Security Rules

### Option A: Via Firebase Console (Fastest - 2 Minutes)

#### 1. Cloud Firestore Rules:
1. Open the [Firebase Console](https://console.firebase.google.com/project/ration-system-877e4/firestore/rules).
2. Click on **Firestore Database** in the left menu > **Rules** tab.
3. Paste the contents of `firebase/firestore.rules`.
4. Click **Publish**.

#### 2. Cloud Storage Rules:
1. Open the [Firebase Storage Rules Console](https://console.firebase.google.com/project/ration-system-877e4/storage/rules).
2. Click on **Storage** in the left menu > **Rules** tab.
3. Paste the contents of `firebase/storage.rules`.
4. Click **Publish**.

#### 3. Realtime Database Rules (Optional):
1. Open [Realtime Database Rules Console](https://console.firebase.google.com/project/ration-system-877e4/database/rules).
2. Paste the contents of `firebase/database.rules.json`.
3. Click **Publish**.

---

### Option B: Via Firebase CLI
```bash
npm install -g firebase-tools
firebase login
firebase use ration-system-877e4
firebase deploy --only firestore:rules,storage:rules
```

---

## 2. Generating Firebase Admin Service Account Key for Backend

To allow the Node.js backend full administrative control to verify records and process transactions:
1. In the Firebase Console, click the Gear icon ⚙️ > **Project settings**.
2. Go to the **Service accounts** tab.
3. Click **Generate new private key**.
4. Save the downloaded JSON file as:
   ```
   backend/config/serviceAccountKey.json
   ```
5. Restart your backend server (`npm start`). The backend will automatically log:
   ```
   ✅ Real Firebase Admin initialized with service account for project: ration-system-877e4
   ```
*(Note: If no service account is placed yet, the backend continues running in persistent local Firestore mirror mode, ensuring uninterrupted operation!)*
