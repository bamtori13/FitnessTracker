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

# 새로 build or package 추가/삭제 등 src외 구조가 바꼈을 때

```shell
1. android/, .expo/, npm_modules/, package-lock.json  삭제
> npm install
> npx expo prebuild --clean
> eas build --profile preview --platform android
```

# build 성공 후 code만 일부 변경 후 build 할 때

```shell
> eas build --profile preview --platform android
```
