interface IEventStore {
  add(e: DomainEvent): void;
  list(): DomainEvent[];
}

class InMemoryEventStore implements IEventStore {
  private readonly events: IEvent[] = []

	add(event: DomainEvent): void {
		this.events.push(event.toState());
	}

	list(): DomainEvent[] {
		return this.events.map(e => DomainEvent.fromState(e));
	}
}

class FormationRepository {
	constructor(
    private readonly eventStore: IEventStore
  ) {
	}

	getById(id: string): Formation {
    const eventsForAggregate = this.eventStore.list()
      .filter(e => e.aggregateId === id)
    const state: any = eventsForAggregate
      .sort((prev, cur) => prev.createdAt < cur.createdAt ? -1 : 1)
      .map(e => e.changes)
			.reduce((prev, cur) => ({ ...prev, ...cur }), {});
    // TODO: stocker les évènements dans l'agrégat ?
    return Formation.fromState(state);
	}

  persist(f: Formation): void {
    f.events.forEach(e => this.eventStore.add(e))
  }
}

interface IEvent {
  nom: string
  changes: any
  createdAt: string
  aggregateId: string
}

abstract class DomainEvent implements IEvent {
  public abstract readonly nom: string
  public readonly aggregateId: string
  public readonly createdAt: string
  public readonly changes: any

	protected constructor(
    aggregateId: string,
    changes: any,
    createdAt?: string
  ) {
    this.aggregateId = aggregateId
    this.changes = changes
    this.createdAt = createdAt ?? (new Date()).toISOString()
	}

  toState(): IEvent {
    return {
      nom: this.nom,
      aggregateId: this.aggregateId,
      createdAt: this.createdAt,
      changes: this.changes,
    }
  }

  static fromState(e: IEvent): DomainEvent {
    switch (e.nom) {
      case 'FORMATION_CREEE':
        return new FormationCreee(e.aggregateId, e.changes, e.createdAt)
      case 'FORMATION_PLANIFIEE':
        return new FormationPlanifiee(e.aggregateId, e.changes, e.createdAt)
    }

    throw new Error('Type d\'évènement inconnu')
  }
}

class FormationCreee extends DomainEvent {
  readonly nom = 'FORMATION_CREEE'

  public static creer(aggregateId: string, data: any) {
    return new FormationCreee(aggregateId, data)
  }
}

class FormationPlanifiee extends DomainEvent {
  readonly nom = 'FORMATION_PLANIFIEE'

  public static creer(aggregateId: string, data: any) {
    return new FormationPlanifiee(aggregateId, data)
  }
}

export interface FormationState {
  id: string
  nom: string
  dureeEnHeures: number
  date?: string
  nomFormateur?: string
}

class Aggregate {
  public readonly events: DomainEvent[] = []
}

class Formation extends Aggregate {
  private readonly id: string
  private nom: string
  private readonly dureeEnHeures: number
  private date: string | null
  private nomFormateur: string | null

	private constructor(
    args: { id: string, nom: string, dureeEnHeures: number, date?: string, nomFormateur?: string }
  ) {
    super()
		this.id = args.id;
		this.nom = args.nom;
    this.dureeEnHeures = args.dureeEnHeures;
    this.date = args.date ?? null;
    this.nomFormateur = args.nomFormateur ?? null;
	}

  public planifierLe(date: string, nomFormateur: string): void {
    this.date = date
    this.nomFormateur = nomFormateur
    this.events.push(FormationPlanifiee.creer(
        this.id,
        { date: this.date, nomFormateur: this.nomFormateur }
      )
    )
 }

	public static creer(id: string, nom: string, dureeEnHeures: number): Formation {
		const formation = new Formation({id, nom, dureeEnHeures});
    formation.events.push(FormationCreee.creer(
      formation.id,
      { id: formation.id, nom: formation.nom, dureeEnHeures: formation.dureeEnHeures }
    ))
    return formation
	}

  /**
   * Pattern memento
   * @see https://refactoring.guru/design-patterns/memento
   */
	public static fromState(state: FormationState): Formation {
		return new Formation({
			id: state.id,
			nom: state.nom,
			dureeEnHeures: state.dureeEnHeures,
      date: state.date,
      nomFormateur: state.nomFormateur
		});
	}
}

async function main () {
  const eventStore = new InMemoryEventStore();
  const formationRepository = new FormationRepository(eventStore)

  const f1 = Formation.creer('DDD01', 'Introduction à DDD', 14)
  formationRepository.persist(f1)

  await delay(1000)

  const planifierFormation = planifierFormationFn(formationRepository)
  const f2 = formationRepository.getById('DDD01')

  // TODO: Gérer la concurrence
  await Promise.all([
    planifierFormation(f2, 2000, '2021'),
    planifierFormation(f2, 0, '2020')
  ])

  const f3 = formationRepository.getById('DDD01')
  console.log(eventStore.list())
  console.log(f3)
}

function planifierFormationFn(
  formationRepository: FormationRepository
): (f: Formation, after: number, date: string) => Promise<void> {
  return async (f: Formation, after: number, date: string) => {
    await delay(after)
    f.planifierLe(date, 'SRE')
    formationRepository.persist(f)
  }
}

main()

async function delay(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration)
  })
}
