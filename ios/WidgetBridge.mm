#import "WidgetBridge.h"
#import <ReactCommon/RCTTurboModule.h>

// Extend WidgetBridge to conform to RCTTurboModule in .mm file
@interface WidgetBridge () <RCTTurboModule>
@end

@implementation WidgetBridge

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_METHOD(collapse) {
    NSLog(@"[WidgetBridge] collapse called");
    dispatch_async(dispatch_get_main_queue(), ^{
        // Use runtime to call FloatingBubbleManager.shared.collapse()
        Class managerClass = NSClassFromString(@"ExpoFlow.FloatingBubbleManager");
        if (!managerClass) {
            managerClass = NSClassFromString(@"FloatingBubbleManager");
        }
        if (managerClass) {
            SEL sharedSel = NSSelectorFromString(@"shared");
            SEL collapseSel = NSSelectorFromString(@"collapse");
            if ([managerClass respondsToSelector:sharedSel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                id manager = [managerClass performSelector:sharedSel];
                if (manager && [manager respondsToSelector:collapseSel]) {
                    [manager performSelector:collapseSel];
                }
#pragma clang diagnostic pop
            }
        }
    });
}

RCT_EXPORT_METHOD(expand) {
    NSLog(@"[WidgetBridge] expand called");
    dispatch_async(dispatch_get_main_queue(), ^{
        // Use runtime to call FloatingBubbleManager.shared.expand()
        Class managerClass = NSClassFromString(@"ExpoFlow.FloatingBubbleManager");
        if (!managerClass) {
            managerClass = NSClassFromString(@"FloatingBubbleManager");
        }
        if (managerClass) {
            SEL sharedSel = NSSelectorFromString(@"shared");
            SEL expandSel = NSSelectorFromString(@"expand");
            if ([managerClass respondsToSelector:sharedSel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                id manager = [managerClass performSelector:sharedSel];
                if (manager && [manager respondsToSelector:expandSel]) {
                    [manager performSelector:expandSel];
                }
#pragma clang diagnostic pop
            }
        }
    });
}

@end
