# iOS Project Setup

The Xcode project file (`.xcodeproj/project.pbxproj`) is not checked into source control because it must be generated on a macOS machine with Xcode installed.

## First-Time Setup (macOS only)

```bash
# From the repo root
cd packages/mobile

# Install JS dependencies
pnpm install

# Generate the Xcode project
npx react-native init SemblanceTemp --version 0.76.0 --directory /tmp/SemblanceTemp

# Copy the generated Xcode project structure
cp -r /tmp/SemblanceTemp/ios/SemblanceTemp.xcodeproj ios/Semblance.xcodeproj

# Rename references inside the project from SemblanceTemp to Semblance
sed -i '' 's/SemblanceTemp/Semblance/g' ios/Semblance.xcodeproj/project.pbxproj

# Update bundle identifier
sed -i '' 's/org.reactjs.native.example.Semblance/run.semblance.app/g' ios/Semblance.xcodeproj/project.pbxproj

# Clean up
rm -rf /tmp/SemblanceTemp

# Install CocoaPods
cd ios && pod install
```

## After Setup

- Open `ios/Semblance.xcworkspace` in Xcode (NOT the `.xcodeproj`)
- Add the `SemblanceMLX` native module files to the Xcode project
- Add the `SemblanceWidget` extension target
- Configure signing: set DEVELOPMENT_TEAM to your Apple Developer Team ID
- Set bundle identifier to `run.semblance.app` in Xcode's Signing & Capabilities

## Native Modules

The following native modules are pre-built and need to be linked in Xcode:

- **SemblanceMLX** (`ios/SemblanceMLX/`) — MLX inference via mlx-swift
- **SemblanceWidget** (`ios/SemblanceWidget/`) — Quick Capture widget extension

These modules exist as source files and are compiled as part of the Xcode build, not as CocoaPods.
