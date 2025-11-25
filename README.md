# Midl Puzzle App
## Setup
1. `npm install`
2. Update `public/index.html` with your Firebase Config.
3. `npm start`
## Deployment
1. `npm install -g firebase-tools`
2. `firebase login`
3. `firebase init` (Choose Hosting, public dir: `build`, single-page app: Yes)
4. `npm run build`
5. `firebase deploy`
