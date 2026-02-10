#import "WidgetBridge.h"
#import <UIKit/UIKit.h>
#import <PhotosUI/PhotosUI.h>
#import <objc/runtime.h>
#import <React/RCTReloadCommand.h>

static NSString *saveImageToTemp(UIImage *image, CGFloat quality) {
    NSData *data = UIImageJPEGRepresentation(image, quality);
    if (!data) return nil;
    NSString *filename = [NSString stringWithFormat:@"widget-paste-%@.jpg", [[NSUUID UUID] UUIDString]];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:filename];
    if ([data writeToFile:path atomically:YES]) {
        return path;
    }
    return nil;
}

static WidgetBridge *sharedBridgeInstance = nil;
static IMP originalTextViewPasteIMP = NULL;
static IMP originalCanPerformActionIMP = NULL;

static BOOL swizzledCanPerformAction(UITextView *self, SEL _cmd, SEL action, id sender) {
    if (action == @selector(paste:) && [UIPasteboard generalPasteboard].hasImages) {
        return YES;
    }
    if (originalCanPerformActionIMP) {
        return ((BOOL(*)(id, SEL, SEL, id))originalCanPerformActionIMP)(self, _cmd, action, sender);
    }
    return NO;
}

static void swizzledTextViewPaste(UITextView *self, SEL _cmd, id sender) {
    UIPasteboard *pb = [UIPasteboard generalPasteboard];
    if (pb.hasImages && pb.image) {
        UIImage *image = pb.image;
        NSString *path = saveImageToTemp(image, 0.8);
        if (path && sharedBridgeInstance) {
            [sharedBridgeInstance sendEventWithName:@"onClipboardImagePaste" body:@{
                @"uri": path,
                @"width": @(image.size.width),
                @"height": @(image.size.height),
            }];
            return;
        }
    }
    if (originalTextViewPasteIMP) {
        ((void(*)(id, SEL, id))originalTextViewPasteIMP)(self, _cmd, sender);
    }
}

@interface WidgetBridge () <PHPickerViewControllerDelegate>
@property (nonatomic, copy) RCTPromiseResolveBlock pickResolve;
@property (nonatomic, copy) RCTPromiseRejectBlock pickReject;
@property (nonatomic, assign) CGFloat pickQuality;
@end

@implementation WidgetBridge

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

+ (void)initialize {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Method pasteMethod = class_getInstanceMethod([UITextView class], @selector(paste:));
        originalTextViewPasteIMP = method_getImplementation(pasteMethod);
        method_setImplementation(pasteMethod, (IMP)swizzledTextViewPaste);

        Method canPerformMethod = class_getInstanceMethod([UITextView class], @selector(canPerformAction:withSender:));
        originalCanPerformActionIMP = method_getImplementation(canPerformMethod);
        method_setImplementation(canPerformMethod, (IMP)swizzledCanPerformAction);
    });
}

- (instancetype)init {
    self = [super init];
    if (self) {
        sharedBridgeInstance = self;
    }
    return self;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onClipboardImagePaste"];
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

RCT_EXPORT_METHOD(reloadMainApp) {
    dispatch_async(dispatch_get_main_queue(), ^{
        RCTTriggerReloadCommandListeners(@"expo-air force reload");
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

RCT_EXPORT_METHOD(pickImages:(int)selectionLimit
                  quality:(double)quality
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.pickResolve = resolve;
        self.pickReject = reject;
        self.pickQuality = (CGFloat)quality;

        PHPickerConfiguration *config = [[PHPickerConfiguration alloc] init];
        config.selectionLimit = selectionLimit;
        config.filter = [PHPickerFilter imagesFilter];

        PHPickerViewController *picker = [[PHPickerViewController alloc] initWithConfiguration:config];
        picker.delegate = self;

        UIViewController *root = [UIApplication sharedApplication].keyWindow.rootViewController;
        while (root.presentedViewController) {
            root = root.presentedViewController;
        }
        [root presentViewController:picker animated:YES completion:nil];
    });
}

#pragma mark - PHPickerViewControllerDelegate

- (void)picker:(PHPickerViewController *)picker didFinishPicking:(NSArray<PHPickerResult *> *)results {
    [picker dismissViewControllerAnimated:YES completion:nil];

    if (results.count == 0) {
        if (self.pickResolve) {
            self.pickResolve(@{ @"canceled": @YES, @"assets": @[] });
        }
        self.pickResolve = nil;
        self.pickReject = nil;
        return;
    }

    CGFloat quality = self.pickQuality;
    NSMutableArray *assets = [NSMutableArray new];
    dispatch_group_t group = dispatch_group_create();

    for (PHPickerResult *result in results) {
        NSItemProvider *provider = result.itemProvider;
        if ([provider canLoadObjectOfClass:[UIImage class]]) {
            dispatch_group_enter(group);
            [provider loadObjectOfClass:[UIImage class] completionHandler:^(id<NSItemProviderReading> object, NSError *error) {
                if (!error && [object isKindOfClass:[UIImage class]]) {
                    UIImage *image = (UIImage *)object;
                    NSString *path = saveImageToTemp(image, quality);
                    if (path) {
                        @synchronized (assets) {
                            [assets addObject:@{
                                @"uri": path,
                                @"width": @(image.size.width),
                                @"height": @(image.size.height),
                            }];
                        }
                    }
                }
                dispatch_group_leave(group);
            }];
        }
    }

    dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        if (self.pickResolve) {
            self.pickResolve(@{ @"canceled": @NO, @"assets": assets });
        }
        self.pickResolve = nil;
        self.pickReject = nil;
    });
}

@end
