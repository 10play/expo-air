#import <UIKit/UIKit.h>

@interface WidgetRuntime : NSObject

- (instancetype)initWithBundleURL:(NSURL *)bundleURL;
- (void)start;
- (UIView *)createSurfaceViewWithModuleName:(NSString *)moduleName
                          initialProperties:(NSDictionary *)properties;
- (void)invalidate;

@end
