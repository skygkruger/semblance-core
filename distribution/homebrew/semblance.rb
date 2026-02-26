cask "semblance" do
  version "0.1.0"

  on_intel do
    sha256 "PLACEHOLDER_INTEL_SHA256"
    url "https://github.com/skygkruger/semblance-core/releases/download/v#{version}/Semblance_#{version}_x64.dmg"
  end
  on_arm do
    sha256 "PLACEHOLDER_ARM_SHA256"
    url "https://github.com/skygkruger/semblance-core/releases/download/v#{version}/Semblance_#{version}_universal.dmg"
  end

  name "Semblance"
  desc "Fully local, self-hosted personal AI — your intelligence, your device, your rules"
  homepage "https://semblance.run"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :ventura"

  app "Semblance.app"

  zap trash: [
    "~/Library/Application Support/run.semblance.app",
    "~/Library/Caches/run.semblance.app",
    "~/Library/Preferences/run.semblance.app.plist",
    "~/Library/Saved Application State/run.semblance.app.savedState",
  ]
end
