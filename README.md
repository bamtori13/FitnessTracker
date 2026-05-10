# build 전 CHECK 할 것

### @.gitignore

```
.expo/
android/
node_modules/
```

### @package.json

```json
#삭제
"main": "App.js"

#추가
"expo-build-properties": "~0.13.3"
"expo-asset": "~11.0.5"
```

### @app.json

"plugins" 아래 추가

```json
 [
    "expo-build-properties",
    {
        "android": {
        "kotlinVersion": "2.0.21"
        }
    }
],
"expo-asset"
```

# 새로 build할 때

```shell
1. android/, .expo/, npm_modules/, package-lock.json  삭제
> npm install
> npx expo prebuild --clean
> eas build --profile preview --platform android
```
