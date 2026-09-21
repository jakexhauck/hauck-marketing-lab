import { describe, it, expect } from "vitest";
import { shapeFormFields } from "./form";

// The live shape of Willis's "Job/Estimate Calendar Form" (GET /forms/{id}),
// trimmed to what shapeFormFields reads.
const WILLIS_FORM = {
  form: {
    formData: {
      form: {
        fields: [
          { label: "First Name", tag: "first_name", type: "text", standard: true },
          { label: "Last Name", tag: "last_name", type: "text", standard: true },
          { label: "Phone", tag: "phone", type: "text", required: true, standard: true },
          { label: "Email", tag: "email", type: "email", required: true, standard: true },
          { label: "Address", tag: "group_address", type: "group" },
          { label: "Street Address", tag: "address", type: "text", standard: true },
          { label: "City", tag: "city", type: "text", standard: true },
          { label: "State", tag: "state", type: "text", standard: true },
          { label: "Country", tag: "country", type: "select", standard: true },
          { label: "Postal Code", tag: "postal_code", type: "text", standard: true },
          { label: "Services", tag: "Fi3SrCzg5d5YpDzcaRrA", type: "large_text" },
          { label: "Any Notes For The Appointment", tag: "LO9AMVEzBi2eN2VjZucb", type: "large_text" },
          { label: "Submit", tag: "button", type: "submit" },
        ],
      },
    },
  },
};

describe("shapeFormFields", () => {
  it("drops name, phone, email, the address group header and submit", () => {
    const keys = shapeFormFields(WILLIS_FORM).map((f) => f.key);
    expect(keys).toEqual([
      "address",
      "city",
      "state",
      "postal_code",
      "Fi3SrCzg5d5YpDzcaRrA",
      "LO9AMVEzBi2eN2VjZucb",
    ]);
  });

  it("marks standard contact fields and custom fields apart", () => {
    const fields = shapeFormFields(WILLIS_FORM);
    expect(fields.find((f) => f.key === "city")?.custom).toBe(false);
    expect(fields.find((f) => f.key === "Fi3SrCzg5d5YpDzcaRrA")?.custom).toBe(true);
  });

  it("keeps the label and whether the field is multi-line", () => {
    const svc = shapeFormFields(WILLIS_FORM).find((f) => f.key === "Fi3SrCzg5d5YpDzcaRrA");
    expect(svc).toMatchObject({ label: "Services", multiline: true });
    const city = shapeFormFields(WILLIS_FORM).find((f) => f.key === "city");
    expect(city?.multiline).toBe(false);
  });

  it("carries picklist options for a choice field", () => {
    const form = {
      form: { formData: { form: { fields: [
        { label: "Stories", tag: "abc123", type: "single_options", picklistOptions: ["1", "2", "3+"] },
      ] } } },
    };
    expect(shapeFormFields(form)[0]).toMatchObject({ key: "abc123", options: ["1", "2", "3+"] });
  });

  it("returns nothing for a missing or malformed form", () => {
    expect(shapeFormFields(null)).toEqual([]);
    expect(shapeFormFields({ form: {} })).toEqual([]);
  });
});
