import { ContactDrawer } from "./ContactDrawer";
import { InfluenceMap } from "./InfluenceMap";
import type { InitiativeData } from "./workspace";
import type { WorkspaceAction } from "./WorkspaceEdit";
export function ContactPage({
  item,
  personId,
  items,
  dark,
  canEdit,
  go,
  onEvent,
  onManage,
  onRefresh,
}: {
  item?: InitiativeData;
  personId: string;
  items: InitiativeData[];
  dark: boolean;
  canEdit: boolean;
  go: (path: string) => void;
  onEvent: () => void;
  onRefresh: () => void;
  onManage?: (action: WorkspaceAction) => void;
}) {
  const person = item?.graph.nodes.find((p) => p.id === personId);
  if (!item || !person)
    return (
      <div className="empty-state">
        <h1>Контакт недоступен</h1>
        <p>Проверьте выбранный проект или вернитесь к списку клиентов.</p>
        <button className="secondary" onClick={() => go("/companies")}>
          К клиентам
        </button>
      </div>
    );
  const base = `/client/${item.initiative.companyId}`;
  const onPerson = (iid: string, pid: string) =>
    go(`${base}/person/${pid}?initiative=${iid}`);
  return (
    <>
      <div className="page-title">
        <div>
          <button
            className="text-button"
            onClick={() =>
              go(`${base}/contacts?initiative=${item.initiative.id}`)
            }
          >
            ← Контакты компании
          </button>
          <h1>{person.name}</h1>
          <p>
            {person.jobTitle ?? "Должность не указана"} · {item.initiative.name}
          </p>
        </div>
      </div>
      <div className="contact-page-grid">
        <ContactDrawer
          key={item.initiative.id + personId}
          presentation="page"
          onRefresh={onRefresh}
          item={item}
          personId={personId}
          workspaceItems={items}
          onPerson={onPerson}
          close={() => go(`${base}/contacts?initiative=${item.initiative.id}`)}
          canEdit={canEdit}
          onEvent={onEvent}
          onManage={onManage}
          onMap={() =>
            go(`${base}/map?initiative=${item.initiative.id}&focus=${personId}`)
          }
        />
        <div className="contact-page-network">
          <InfluenceMap
            key={item.initiative.id + personId}
            item={item}
            selectedId={personId}
            initialFocus={personId}
            onSelect={(pid) => onPerson(item.initiative.id, pid)}
            darkTheme={dark}
            onAddRelationship={
              onManage
                ? () =>
                    onManage({
                      kind: "relationship",
                      iid: item.initiative.id,
                      pid: personId,
                    })
                : undefined
            }
          />
        </div>
      </div>
    </>
  );
}
