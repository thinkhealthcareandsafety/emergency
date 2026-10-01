import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const PropertySchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: String,
    assemblyPoint: String,
    emergencyContacts: [{ _id: false, label: String, number: String }],
  },
  { timestamps: true }
);

const OverrideSchema = new Schema(
  {
    status: { type: String, enum: ['AVAILABLE', 'UNAVAILABLE'], required: true },
    reason: String,
    until: Date,
    by: String,
    at: Date,
  },
  { _id: false }
);

const EmployeeSchema = new Schema(
  {
    empCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    designation: String,
    department: String,
    propertyCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    ertRoles: { type: [String], default: [] },
    phone: String,
    photoUrl: String,
    active: { type: Boolean, default: true },
    lastPunchType: { type: String, enum: ['IN', 'OUT', null], default: null },
    lastPunchAt: Date,
    lastPunchSource: String,
    override: { type: OverrideSchema, default: null },
    autoCreated: { type: Boolean, default: false },
    demoVisitor: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const PunchEventSchema = new Schema(
  {
    empCode: { type: String, required: true, index: true },
    propertyCode: { type: String, uppercase: true, index: true },
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    at: { type: Date, required: true },
    source: String,
    dedupeKey: { type: String, required: true, unique: true },
    applied: Boolean,
    raw: Schema.Types.Mixed,
  },
  { timestamps: true }
);
PunchEventSchema.index({ propertyCode: 1, at: -1 });

const RoleSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, default: '#94a3b8' },
    minOnDuty: { type: Number, default: 1, min: 0 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const SettingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    roles: { type: [RoleSchema], default: [] },
    staleAfterHours: { type: Number, default: 14 },
    hono: {
      cursor: Date,
      lastRunAt: Date,
      lastOk: Boolean,
      lastError: String,
      lastCount: Number,
    },
  },
  { timestamps: true }
);

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'supervisor'], default: 'admin' },
  },
  { timestamps: true }
);

const EmergencySchema = new Schema(
  {
    propertyCode: { type: String, required: true, uppercase: true, index: true },
    type: { type: String, default: 'Emergency' },
    note: String,
    startedAt: { type: Date, default: Date.now },
    startedBy: String,
    endedAt: Date,
    endedBy: String,
    accounted: [{ _id: false, empCode: String, at: Date, by: String }],
  },
  { timestamps: true }
);

export const Property = model('Property', PropertySchema);
export const Employee = model('Employee', EmployeeSchema);
export const PunchEvent = model('PunchEvent', PunchEventSchema);
export const Settings = model('Settings', SettingsSchema);
export const User = model('User', UserSchema);
export const Emergency = model('Emergency', EmergencySchema);
