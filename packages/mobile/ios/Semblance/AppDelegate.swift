import UIKit
import React

@main
class AppDelegate: UIResponder, UIApplicationDelegate, RCTBridgeDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let bridge = RCTBridge(delegate: self, launchOptions: launchOptions)!
        let rootView = RCTRootView(bridge: bridge, moduleName: "Semblance", initialProperties: nil)

        // Dark background matching brand while React Native loads
        rootView.backgroundColor = UIColor(red: 11/255, green: 14/255, blue: 17/255, alpha: 1)

        window = UIWindow(frame: UIScreen.main.bounds)
        let rootViewController = UIViewController()
        rootViewController.view = rootView
        window?.rootViewController = rootViewController
        window?.makeKeyAndVisible()

        // Register for memory warnings to unload ML models
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            // SemblanceMLX module handles this via its own memory warning handler
            // which is registered as a React Native event observer
        }

        return true
    }

    // MARK: - RCTBridgeDelegate

    func sourceURL(for bridge: RCTBridge) -> URL? {
        #if DEBUG
        return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
        #else
        return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
        #endif
    }

    // MARK: - Background Tasks

    func application(
        _ application: UIApplication,
        performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        // Background fetch for Morning Brief preparation
        completionHandler(.newData)
    }
}
