export function rowToFleetGlobal(row) {
  if (!row) {
    return {
      fontSize: 'normal',
      displayTheme: 'default',
      boldNumbers: false,
      largeButtons: false,
      comfortableReading: false,
    };
  }
  return {
    fontSize: row.font_size ?? 'normal',
    displayTheme: row.display_theme ?? 'default',
    boldNumbers: Boolean(row.bold_numbers),
    largeButtons: Boolean(row.large_buttons),
    comfortableReading: Boolean(row.comfortable_reading),
  };
}

export function rowToVehicleMeta(row) {
  return {
    id: row.id,
    label: row.label || 'سيارة',
    vehicleImage: row.vehicle_image || '',
    ownerName: row.owner_name || '',
    monthlyGuarantee: Number(row.monthly_guarantee ?? 750),
    currentDriverName: row.current_driver_name || '',
    vehicleCost: Number(row.vehicle_cost ?? 0),
    vehicleLifeYears: Number(row.vehicle_life_years ?? 7),
    insuranceReceivedTotal: Number(row.insurance_received_total ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at || '',
    assignedUserId: row.assigned_user_id || null,
    assignedUserDisplayName: row.assigned_user_display_name || null,
    assignedUsername: row.assigned_username || null,
    driverFirstPaymentDate: row.driver_first_payment_date?.trim() || undefined,
    driverPaymentMode: row.driver_payment_mode === 'deferred' ? 'deferred' : 'advance',
    paymentCycleEpoch: Number(row.payment_cycle_epoch ?? 0),
  };
}

export function rowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    month: row.month,
    driverName: row.driver_name,
    revenue: Number(row.revenue),
    expenses: Number(row.expenses),
    expenseDetails: {
      office: Number(row.expense_office),
      insurance: Number(row.expense_insurance),
      oil: Number(row.expense_oil),
      maintenance: Number(row.expense_maintenance),
      accident: Number(row.expense_accident ?? 0),
      commission: Number(row.expense_commission),
      other: Number(row.expense_other),
    },
    notes: row.notes || '',
    driverPaid: Number(row.driver_paid),
    driverPayments: [
      Number(row.driver_payment_1 ?? 0),
      Number(row.driver_payment_2 ?? 0),
      Number(row.driver_payment_3 ?? 0),
    ],
    paymentComplete: Boolean(row.payment_complete),
    workStartDate: row.work_start_date?.trim() || undefined,
    paymentAnchorDate: row.payment_anchor_date?.trim() || undefined,
    paymentCycleEpoch:
      row.payment_cycle_epoch != null ? Number(row.payment_cycle_epoch) : undefined,
    monthlyGuarantee: row.monthly_guarantee != null ? Number(row.monthly_guarantee) : undefined,
    // F5: Expense classification
    expenseType: row.expense_type || 'normal',
    // F1: Running balance snapshot
    previousBalanceCarriedForward: Number(row.previous_balance_carried_forward ?? 0),
    currentGuaranteeDue: Number(row.current_guarantee_due ?? 0),
    totalOutstandingBalance: Number(row.total_outstanding_balance ?? 0),
    // F4: Audit
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
  };
}

export function rowToAccident(row) {
  return {
    id: row.id,
    accidentDate: row.accident_date,
    responsibleDriver: row.responsible_driver ?? '',
    downtimeDays: Number(row.downtime_days ?? 0),
    details: row.details || '',
    cost: Number(row.cost ?? 0),
    insurancePending: Number(row.insurance_pending ?? 0),
    insuranceReceived: Number(row.insurance_received ?? 0),
  };
}

export function rowToLicense(row) {
  const year = row.license_year ?? new Date().getFullYear();
  const licenseDate =
    row.license_date && String(row.license_date).length >= 8
      ? row.license_date
      : `${year}-01-01`;
  return {
    id: row.id,
    licenseDate,
    licenseYear: parseInt(String(licenseDate).slice(0, 4), 10) || year,
    amountPaid: Number(row.amount_paid ?? 0),
    notes: row.notes || '',
  };
}

export function rowToOilChange(row) {
  return {
    id: row.id,
    entryId: row.entry_id || '',
    changeDate: row.change_date,
    cost: Number(row.cost ?? 0),
    oilType: row.oil_type || '',
    oilGrade: row.oil_grade || '',
    currentOdometer: Number(row.current_odometer ?? 0),
    distanceKm: Number(row.distance_km ?? 0),
    nextOdometer: Number(row.next_odometer ?? 0),
    notes: row.notes || '',
    driverName: row.driver_name || '',
  };
}

export function rowToDriverProfile(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date || null,
    phoneNumber: row.phone_number || '',
    nationalId: row.national_id || '',
    emergencyContact: row.emergency_contact || '',
    driverNotes: row.driver_notes || '',
    notes: row.notes || '',
    currentOutstandingBalance: Number(row.current_outstanding_balance ?? 0),
    createdAt: row.created_at || '',
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
  };
}

export function rowToDriverAssignment(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    monthlyEntryId: row.monthly_entry_id || null,
    driverId: row.driver_id,
    driverName: row.driver_name || undefined,
    startDate: row.start_date,
    endDate: row.end_date || null,
    daysWorked: Number(row.days_worked ?? 0),
    proratedGuarantee: Number(row.prorated_guarantee ?? 0),
    previousBalanceCarriedForward: Number(row.previous_balance_carried_forward ?? 0),
    paymentsReceived: Number(row.payments_received ?? 0),
    remainingBalance: Number(row.remaining_balance ?? 0),
    isActive: Boolean(row.is_active),
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || '',
  };
}

export function rowToAuditLog(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actionType: row.action_type,
    oldValue: row.old_value || null,
    newValue: row.new_value || null,
    performedBy: row.performed_by || null,
    performedAt: row.performed_at || '',
  };
}
