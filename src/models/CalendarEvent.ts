import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const calendarEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contestId: { type: String, required: true, index: true },
    googleEventId: { type: String, required: true },
    pendingSince: { type: Date, default: null },
    status: {
      type: String,
      enum: ["synced", "updated", "failed", "pending", "disabled"],
      default: "synced",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

calendarEventSchema.index({ userId: 1, contestId: 1 }, { unique: true });

export type CalendarEventDocument = InferSchemaType<typeof calendarEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CalendarEvent: Model<CalendarEventDocument> =
  mongoose.models.CalendarEvent ??
  mongoose.model<CalendarEventDocument>("CalendarEvent", calendarEventSchema);
