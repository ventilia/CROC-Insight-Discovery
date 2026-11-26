import { ArrowLeft } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
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
  returnTo,
  server,
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
  returnTo?: string;
  server?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const person = item?.graph.nodes.find((p) => p.id === personId);
  useLayoutEffect(() => {
    if (!person) return;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [person?.id]);
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
  const back = () =>
    go(returnTo ?? `${base}/contacts?initiative=${item.initiative.id}`);
  const onPerson = (iid: string, pid: string) => {
    const params = new URLSearchParams({ initiative: iid });
    if (returnTo && iid === item.initiative.id) {
      params.set("from", "map");
      const [, query] = returnTo.split("?");
      const previous = new URLSearchParams(query);
      for (const key of ["focus", "depth", "shared", "sharedOnly"]) {
        const value = previous.get(key);
        if (value) params.set(key, value);
      }
    }
    go(`${base}/person/${pid}?${params}`);
  };
  return (
    <div className="profile-page">
      <div className="page-title">
        <div>
          <button
            className="text-button profile-page-back"
            type="button"
            onClick={back}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {returnTo ? "К карте связей" : "К контактам компании"}
          </button>
          <h1 ref={heading} tabIndex={-1}>
            {person.name}
          </h1>
          <p>
            {person.jobTitle ?? "Должность не указана"} · {item.initiative.name}
          </p>
        </div>
      </div>
      <div className="contact-page-grid">
        <div className="contact-page-network">
          <InfluenceMap
            key={item.initiative.id + personId}
            item={item}
            selectedId={personId}
            initialFocus={personId}
            onSelect={(pid) => onPerson(item.initiative.id, pid)}
            darkTheme={dark}
            variant="profile"
          />
        </div>
        <ContactDrawer
          key={item.initiative.id + personId}
          presentation="page"
          onRefresh={onRefresh}
          item={item}
          personId={personId}
          workspaceItems={items}
          onPerson={onPerson}
          close={back}
          canEdit={canEdit}
          server={server}
          onEvent={onEvent}
          onManage={onManage}
          onMap={() =>
            go(`${base}/map?initiative=${item.initiative.id}&focus=${personId}`)
          }
        />
      </div>
    </div>
  );
}
