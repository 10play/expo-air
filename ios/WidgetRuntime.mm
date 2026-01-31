#import "WidgetRuntime.h"

#import <RCTRootViewFactory.h>
#import <RCTAppSetupUtils.h>
#import <react/runtime/JSRuntimeFactoryCAPI.h>
#import <React/RCTHermesInstanceFactory.h>
#import <React/CoreModulesPlugins.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <react/nativemodule/defaults/DefaultTurboModules.h>

// Need RCTHost forward declaration for the delegate
@class RCTHost;

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
    }
    return self;
}

- (void)start {
    if (_viewFactory) return;

    NSLog(@"[WidgetRuntime] Starting with bundle URL: %@", _bundleURL);

    _dependencyProvider = [[RCTAppDependencyProvider alloc] init];

    NSURL *url = _bundleURL;
    RCTRootViewFactoryConfiguration *config =
        [[RCTRootViewFactoryConfiguration alloc] initWithBundleURLBlock:^{ return url; }
                                                         newArchEnabled:YES];
    config.jsRuntimeConfiguratorDelegate = self;

    _viewFactory = [[RCTRootViewFactory alloc]
        initWithTurboModuleDelegate:self
                       hostDelegate:self
                      configuration:config];
}

- (UIView *)createSurfaceViewWithModuleName:(NSString *)moduleName
                          initialProperties:(NSDictionary *)properties {
    if (!_viewFactory) return nil;
    UIView *view = [_viewFactory viewWithModuleName:moduleName
                                  initialProperties:properties ?: @{}];
    view.backgroundColor = [UIColor clearColor];
    return view;
}

- (void)invalidate {
    _viewFactory = nil;
}

#pragma mark - RCTHostDelegate

- (void)hostDidStart:(RCTHost *)host {}

#pragma mark - RCTTurboModuleManagerDelegate

- (Class)getModuleClassFromName:(const char *)name {
    return RCTCoreModulesClassProvider(name);
}

- (id<RCTTurboModule>)getModuleInstanceFromClass:(Class)moduleClass {
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
