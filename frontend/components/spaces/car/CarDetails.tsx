import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";

export type CarVehicle = {
  make?: string;
  model?: string;
  year?: number;
  registration_number?: string;
  vin?: string;
  mileage?: number;
  fuel_type?: string;
  engine?: string;
};

export type CarDetailsProps = {
  vehicle: CarVehicle;
};

export function CarDetails({
  vehicle,
}: CarDetailsProps) {
  const { colors, spacing, radius } = useTheme();

  const rows = [
    ["Make", vehicle.make],
    ["Model", vehicle.model],
    ["Year", vehicle.year?.toString()],
    ["Registration", vehicle.registration_number],
    ["VIN", vehicle.vin],
    ["Mileage", vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} km` : undefined],
    ["Fuel", vehicle.fuel_type],
    ["Engine", vehicle.engine],
  ];

  const visibleRows = rows.filter(([, value]) => value);

  if (!visibleRows.length) {
    return null;
  }

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        VEHICLE DETAILS
      </Text>

      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          overflow: "hidden",
        }}
      >
        {visibleRows.map(([label, value], index) => (
          <View
            key={label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderBottomWidth:
                index === visibleRows.length - 1 ? 0 : 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: colors.onSurfaceTertiary,
              }}
            >
              {label}
            </Text>

            <Text
              style={{
                maxWidth: "60%",
                fontSize: 14,
                fontWeight: "600",
                color: colors.onSurface,
                textAlign: "right",
              }}
              numberOfLines={1}
            >
              {String(value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}