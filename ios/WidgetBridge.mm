#import "WidgetBridge.h"
#import <UserNotifications/UserNotifications.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

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

@interface WidgetBridge ()
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

RCT_EXPORT_METHOD(requestPushToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSLog(@"[WidgetBridge] requestPushToken called");

    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];

    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                          completionHandler:^(BOOL granted, NSError * _Nullable error) {
        if (error) {
            NSLog(@"[WidgetBridge] Push permission error: %@", error);
            reject(@"PERMISSION_ERROR", error.localizedDescription, error);
            return;
        }

        if (!granted) {
            NSLog(@"[WidgetBridge] Push permission denied");
            resolve([NSNull null]);
            return;
        }

        NSLog(@"[WidgetBridge] Push permission granted, registering for remote notifications");

        dispatch_async(dispatch_get_main_queue(), ^{
            [[UIApplication sharedApplication] registerForRemoteNotifications];

            // Wait for device token to be set by AppDelegate, then get Expo token
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                NSString *deviceToken = [[NSUserDefaults standardUserDefaults] stringForKey:@"expo-air-device-token"];

                if (!deviceToken) {
                    NSLog(@"[WidgetBridge] No device token available yet");
                    resolve([NSNull null]);
                    return;
                }

                NSLog(@"[WidgetBridge] Got device token: %@", deviceToken);

                // Get app info for Expo API
                NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];

                // Get EAS project ID from expo config (stored in Info.plist by expo prebuild)
                NSString *projectId = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"EASProjectID"];
                if (!projectId) {
                    // Fallback: use bundle ID as experience ID format
                    projectId = bundleId;
                }

                NSLog(@"[WidgetBridge] Using projectId: %@, bundleId: %@", projectId, bundleId);

                // Call Expo's API to convert device token to Expo push token
                [self getExpoPushTokenWithDeviceToken:deviceToken
                                            projectId:projectId
                                             bundleId:bundleId
                                           completion:^(NSString *expoToken, NSError *error) {
                    if (expoToken) {
                        NSLog(@"[WidgetBridge] Got Expo push token: %@", expoToken);
                        [[NSUserDefaults standardUserDefaults] setObject:expoToken forKey:@"expo-air-expo-token"];
                        resolve(expoToken);
                    } else {
                        NSLog(@"[WidgetBridge] Failed to get Expo token: %@", error);
                        resolve([NSNull null]);
                    }
                }];
            });
        });
    }];
}

- (void)getExpoPushTokenWithDeviceToken:(NSString *)deviceToken
                              projectId:(NSString *)projectId
                               bundleId:(NSString *)bundleId
                             completion:(void (^)(NSString *expoToken, NSError *error))completion {
    NSURL *url = [NSURL URLWithString:@"https://exp.host/--/api/v2/push/getExpoPushToken"];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.HTTPMethod = @"POST";
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];

    // Create unique device ID (persistent per device)
    NSString *deviceId = [[NSUserDefaults standardUserDefaults] stringForKey:@"expo-air-device-id"];
    if (!deviceId) {
        deviceId = [[NSUUID UUID] UUIDString];
        [[NSUserDefaults standardUserDefaults] setObject:deviceId forKey:@"expo-air-device-id"];
    }

    NSDictionary *body = @{
        @"deviceToken": deviceToken,
        @"type": @"apns",
        @"development": @YES,  // DEBUG mode
        @"projectId": projectId ?: bundleId,
        @"appId": bundleId,
        @"deviceId": deviceId
    };

    NSError *jsonError;
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:&jsonError];
    if (jsonError) {
        completion(nil, jsonError);
        return;
    }

    NSLog(@"[WidgetBridge] Calling Expo API with body: %@", body);

    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
            if (error) {
                completion(nil, error);
                return;
            }

            NSError *parseError;
            NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:&parseError];
            if (parseError) {
                completion(nil, parseError);
                return;
            }

            NSLog(@"[WidgetBridge] Expo API response: %@", json);

            // Response format: { "data": { "expoPushToken": "ExponentPushToken[xxx]" } }
            NSString *token = json[@"data"][@"expoPushToken"];
            if (token) {
                completion(token, nil);
            } else {
                NSError *noTokenError = [NSError errorWithDomain:@"WidgetBridge"
                                                            code:1
                                                        userInfo:@{NSLocalizedDescriptionKey: @"No token in response"}];
                completion(nil, noTokenError);
            }
        }];
    [task resume];
}

@end
