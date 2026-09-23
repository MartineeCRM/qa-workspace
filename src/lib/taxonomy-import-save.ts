import {
  db,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
  type TaxonomyCustomAttribute,
  type TaxonomyCustomAttributeProperty,
} from "./queries";
import type { ImportedAttribute, ImportedTaxonomy } from "./taxonomy-import";

export async function saveTaxonomyImport(input: {
  projectId: string;
  userId: string | undefined;
  parsed: ImportedTaxonomy;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  customAttributeProperties?: TaxonomyCustomAttributeProperty[];
}) {
  const { projectId, userId, parsed } = input;
  if (!userId) throw new Error("로그인 후 다시 시도해 주세요.");
  const events = new Map(input.events.map((e) => [e.technical_name, e.id]));
  const props = new Map(
    input.eventProperties.map((p) => [`${p.event_id}::${p.technical_name}`, p.id]),
  );
  const custom = new Map(input.customAttributes.map((a) => [a.technical_name, a.id]));
  const customProps = new Map(
    (input.customAttributeProperties ?? []).map((p) => [
      `${p.custom_attribute_id}::${p.technical_name}`,
      p.id,
    ]),
  );
  const result = { createdEvents: 0, createdAttrs: 0, updated: 0 };

  for (const ev of parsed.events) {
    let eventId = events.get(ev.technical_name);
    const values = {
      display_name: ev.display_name,
      description: ev.description,
      trigger_description: ev.trigger_description,
    };
    if (eventId) {
      const { error } = await db.from("taxonomy_events").update(values).eq("id", eventId);
      if (error) throw error;
      result.updated += 1;
    } else {
      const { data, error } = await db
        .from("taxonomy_events")
        .insert({
          ...values,
          project_id: projectId,
          technical_name: ev.technical_name,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      eventId = data.id as string;
      events.set(ev.technical_name, eventId);
      result.createdEvents += 1;
    }
    for (const [sort, a] of ev.attributes.entries()) {
      const key = `${eventId}::${a.technical_name}`;
      const id = props.get(key);
      const table = db.from("taxonomy_event_properties");
      const response = await (id
        ? table.update(attributeValues(a)).eq("id", id).select("id").single()
        : table
            .insert({
              ...attributeValues(a),
              event_id: eventId,
              technical_name: a.technical_name,
              sort_order: sort,
              created_by: userId,
            })
            .select("id")
            .single());
      if (response.error) throw response.error;
      props.set(key, response.data.id);
      if (id) result.updated += 1;
      else result.createdAttrs += 1;
    }
  }
  for (const [sort, a] of parsed.userAttributes.entries()) {
    const id = custom.get(a.technical_name);
    const table = db.from("taxonomy_custom_attributes");
    const response = await (id
      ? table.update(attributeValues(a)).eq("id", id).select("id").single()
      : table
          .insert({
            ...attributeValues(a),
            project_id: projectId,
            technical_name: a.technical_name,
            sort_order: sort,
            created_by: userId,
          })
          .select("id")
          .single());
    if (response.error) throw response.error;
    const customAttributeId = response.data.id as string;
    custom.set(a.technical_name, customAttributeId);
    if (id) result.updated += 1;
    else result.createdAttrs += 1;

    if (a.data_type !== "array of object" || !a.properties?.length) continue;
    for (const [propSort, p] of a.properties.entries()) {
      const key = `${customAttributeId}::${p.technical_name}`;
      const propId = customProps.get(key);
      const propTable = db.from("taxonomy_custom_attribute_properties");
      const propResponse = await (propId
        ? propTable.update(attributeValues(p)).eq("id", propId).select("id").single()
        : propTable
            .insert({
              ...attributeValues(p),
              custom_attribute_id: customAttributeId,
              technical_name: p.technical_name,
              sort_order: propSort,
              created_by: userId,
            })
            .select("id")
            .single());
      if (propResponse.error) throw propResponse.error;
      customProps.set(key, propResponse.data.id);
      if (propId) result.updated += 1;
      else result.createdAttrs += 1;
    }
  }
  return result;
}

function attributeValues(a: ImportedAttribute) {
  return {
    display_name: a.display_name,
    description: a.description,
    data_type: a.data_type,
    is_required: a.is_required,
    allowed_values: a.allowed_values,
    example_value: a.example_value ?? null,
  };
}
