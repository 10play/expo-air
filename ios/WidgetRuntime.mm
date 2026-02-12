#import "WidgetRuntime.h"
#import "WidgetBridge.h"

#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <RCTRootViewFactory.h>
#import <RCTAppSetupUtils.h>
#import <react/runtime/JSRuntimeFactoryCAPI.h>
#import <React/RCTHermesInstanceFactory.h>
#import <React/CoreModulesPlugins.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <ReactCommon/RCTHost.h>
#import <react/nativemodule/defaults/DefaultTurboModules.h>
#import <React/RCTBridge+Private.h>
#import <objc/runtime.h>
#import <react/featureflags/ReactNativeFeatureFlags.h>
#import <react/featureflags/ReactNativeFeatureFlagsDefaults.h>

// ---------------------------------------------------------------------------
// Feature flags provider that ensures microtasks are enabled for the widget's
// Hermes runtime. The main app may use old architecture (bridge mode) which
// leaves enableBridgelessArchitecture=false, but our widget always needs
// bridgeless + microtasks to function with React 19.
// ---------------------------------------------------------------------------
namespace {
class WidgetFeatureFlagsProvider : public facebook::react::ReactNativeFeatureFlagsDefaults {
 public:
  bool enableBridgelessArchitecture() override { return true; }
};
} // namespace

static void ensureBridgelessFeatureFlags(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        if (!facebook::react::ReactNativeFeatureFlags::enableBridgelessArchitecture()) {
            facebook::react::ReactNativeFeatureFlags::dangerouslyForceOverride(
                std::make_unique<WidgetFeatureFlagsProvider>());
            NSLog(@"[WidgetRuntime] Force-enabled bridgeless feature flags for widget microtask support");
        }
    });
}

// ---------------------------------------------------------------------------
// Swizzle RCTHost's didReceiveReloadCommand so the widget host can opt out
// of the global reload broadcast that fires when the main app reloads.
// ---------------------------------------------------------------------------

static NSHashTable<RCTHost *> *_widgetHosts = nil;

static void swizzleReloadOnce(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        _widgetHosts = [NSHashTable weakObjectsHashTable];

        Class cls = [RCTHost class];
        SEL sel = @selector(didReceiveReloadCommand);
        Method method = class_getInstanceMethod(cls, sel);
        if (!method) return;

        typedef void (*OrigIMP)(id, SEL);
        OrigIMP origIMP = (OrigIMP)method_getImplementation(method);

        IMP newIMP = imp_implementationWithBlock(^(id self_) {
            if ([_widgetHosts containsObject:self_]) {
                NSLog(@"[WidgetRuntime] Ignoring global reload command for widget host");
                return;
            }
            origIMP(self_, sel);
        });

        method_setImplementation(method, newIMP);
    });
}

// ---------------------------------------------------------------------------

@interface WidgetRuntime () <RCTHostDelegate, RCTTurboModuleManagerDelegate, RCTJSRuntimeConfiguratorProtocol>
@property (nonatomic, strong) NSURL *bundleURL;
@property (nonatomic, strong) RCTRootViewFactory *viewFactory;
@property (nonatomic, strong) RCTAppDependencyProvider *dependencyProvider;
@end

@implementation WidgetRuntime

- (instancetype)initWithBundleURL:(NSURL *)bundleURL {
    self = [super init];
    if (self) {
        _bundleURL = bundleURL;
        NSLog(@"[WidgetRuntime] initWithBundleURL: %@", bundleURL);
    }
    return self;
}

- (void)start {
    if (_viewFactory) return;

    NSLog(@"[WidgetRuntime] Starting with bundle URL: %@", _bundleURL);

    // Ensure bridgeless feature flags are enabled so Hermes creates
    // its runtime with microtask support (required by React 19).
    ensureBridgelessFeatureFlags();

    // Swizzle before the factory creates the RCTHost
    swizzleReloadOnce();

    _dependencyProvider = [[RCTAppDependencyProvider alloc] init];

    NSURL *url = _bundleURL;
    NSLog(@"[WidgetRuntime] Creating config with bundleURL: %@", url);
    RCTRootViewFactoryConfiguration *config =
        [[RCTRootViewFactoryConfiguration alloc] initWithBundleURLBlock:^{
            NSLog(@"[WidgetRuntime] bundleURLBlock called, returning: %@", url);
            return url;
        }
                                                         newArchEnabled:YES];
    config.jsRuntimeConfiguratorDelegate = self;

    _viewFactory = [[RCTRootViewFactory alloc]
        initWithTurboModuleDelegate:self
                       hostDelegate:self
                      configuration:config];
}

- (UIView *)createSurfaceViewWithModuleName:(NSString *)moduleName
                          initialProperties:(NSDictionary *)properties {
    NSLog(@"[WidgetRuntime] createSurfaceView moduleName: %@, viewFactory: %@", moduleName, _viewFactory);
    if (!_viewFactory) {
        NSLog(@"[WidgetRuntime] ERROR: viewFactory is nil!");
        return nil;
    }
    UIView *view = [_viewFactory viewWithModuleName:moduleName
                                  initialProperties:properties ?: @{}];
    NSLog(@"[WidgetRuntime] Created view: %@", view);
    view.backgroundColor = [UIColor clearColor];

    // Mark the widget's RCTHost so it ignores global reload commands
    RCTHost *host = _viewFactory.reactHost;
    if (host) {
        [_widgetHosts addObject:host];
    }

    return view;
}

- (void)invalidate {
    _viewFactory = nil;
}

#pragma mark - RCTHostDelegate

- (void)hostDidStart:(RCTHost *)host {}

#pragma mark - RCTTurboModuleManagerDelegate

- (Class)getModuleClassFromName:(const char *)name {
    // Provide WidgetBridge for the widget runtime
    if (strcmp(name, "WidgetBridge") == 0) {
        return [WidgetBridge class];
    }
    return RCTCoreModulesClassProvider(name);
}

- (id<RCTTurboModule>)getModuleInstanceFromClass:(Class)moduleClass {
    // Handle WidgetBridge specially - instantiate it directly
    // Cast is safe because WidgetBridge conforms to RCTTurboModule in its .mm file
    if (moduleClass == [WidgetBridge class]) {
        return (id<RCTTurboModule>)[[WidgetBridge alloc] init];
    }
    return RCTAppSetupDefaultModuleFromClass(moduleClass, _dependencyProvider);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const std::string &)name
                                                       jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker {
    return facebook::react::DefaultTurboModules::getTurboModule(name, jsInvoker);
}

#pragma mark - RCTJSRuntimeConfiguratorProtocol

- (JSRuntimeFactoryRef)createJSRuntimeFactory {
    return jsrt_create_hermes_factory();
}

@end
