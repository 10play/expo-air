import { execSync } from "child_process";

export interface ConnectedDevice {
  udid: string;
  name: string;
  type: "usb" | "wifi";
}

/**
 * Detect connected iOS devices via USB
 */
export function detectConnectedDevices(): ConnectedDevice[] {
  const devices: ConnectedDevice[] = [];

  try {
    // Use xcrun xctrace to list devices
    const output = execSync("xcrun xctrace list devices 2>/dev/null", {
      encoding: "utf-8",
      timeout: 10000,
    });

    // Parse output - looking for physical devices (not simulators)
    // Format: "Device Name (OS Version) (UDID)"
    const lines = output.split("\n");
    let inDevicesSection = false;

    for (const line of lines) {
      // Skip simulator section and offline devices
      if (line.includes("Simulator") || line.includes("Offline")) {
        inDevicesSection = false;
        continue;
      }

      // Start of devices section
      if (line.includes("== Devices ==")) {
        inDevicesSection = true;
        continue;
      }

      if (inDevicesSection && line.trim()) {
        // Match pattern: "Device Name (17.0) (00008XXX-XXXX)"
        const match = line.match(/^(.+?)\s+\([\d.]+\)\s+\(([A-F0-9-]+)\)/i);
        if (match) {
          const [, name, udid] = match;
          // Filter out Macs and only keep iPhones/iPads
          if (!name.toLowerCase().includes("mac") && udid.length > 20) {
            devices.push({
              udid: udid.trim(),
              name: name.trim(),
              type: "usb", // xctrace shows USB-connected devices primarily
            });
          }
        }
      }
    }
  } catch {
    // If xctrace fails, try system_profiler for USB devices
    try {
      const usbOutput = execSync(
        'system_profiler SPUSBDataType 2>/dev/null | grep -A 5 "iPhone\\|iPad"',
        { encoding: "utf-8", timeout: 10000 }
      );

      if (usbOutput.includes("iPhone") || usbOutput.includes("iPad")) {
        // Found a device via USB, but we don't have the UDID easily
        // Return a placeholder - expo will auto-detect
        devices.push({
          udid: "auto",
          name: "iOS Device (USB)",
          type: "usb",
        });
      }
    } catch {
      // No devices found
    }
  }

  return devices;
}

/**
 * Select a device from the list by UDID or name
 */
export function selectDevice(
  devices: ConnectedDevice[],
  deviceOption?: string
): ConnectedDevice | null {
  if (devices.length === 0) {
    return null;
  }

  if (!deviceOption) {
    return devices[0];
  }

  const found = devices.find(
    (d) =>
      d.udid === deviceOption ||
      d.name.toLowerCase().includes(deviceOption.toLowerCase())
  );

  return found || devices[0];
}
