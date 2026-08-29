module powerchain_launchpad::adapter_registry;

use sui::table::{Self, Table};
use sui::event;

const E_UNAUTHORIZED: u64 = 1;
const E_INVALID_VENUE: u64 = 2;
const E_INVALID_VERSION: u64 = 3;
const E_INVALID_ADAPTER_ID: u64 = 4;
const E_INVALID_CONFIG_HASH: u64 = 5;
const E_ADAPTER_NOT_FOUND: u64 = 6;
const E_ADAPTER_DISABLED: u64 = 7;
const E_ADAPTER_MISMATCH: u64 = 8;

public struct AdapterKey has copy, drop, store {
    venue: u8,
    adapter_id_hash: vector<u8>,
    version: u64,
}

public struct AdapterEntry has copy, drop, store {
    adapter_program: address,
    config_hash: vector<u8>,
    active: bool,
}

public struct AdapterRegistry has key {
    id: UID,
    authority: address,
    entries: Table<AdapterKey, AdapterEntry>,
}

public struct RegistryCreated has copy, drop {
    registry_id: ID,
    authority: address,
}

public struct AdapterUpdated has copy, drop {
    registry_id: ID,
    venue: u8,
    version: u64,
    adapter_program: address,
    active: bool,
}

public fun create_registry(ctx: &mut TxContext) {
    let registry = AdapterRegistry {
        id: object::new(ctx),
        authority: ctx.sender(),
        entries: table::new(ctx),
    };
    let registry_id = object::id(&registry);
    event::emit(RegistryCreated { registry_id, authority: ctx.sender() });
    transfer::share_object(registry);
}

public fun upsert_adapter(
    registry: &mut AdapterRegistry,
    venue: u8,
    adapter_id_hash: vector<u8>,
    version: u64,
    adapter_program: address,
    config_hash: vector<u8>,
    active: bool,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == registry.authority, E_UNAUTHORIZED);
    assert!(venue <= 2, E_INVALID_VENUE);
    assert!(version > 0, E_INVALID_VERSION);
    assert!(adapter_id_hash.length() == 32, E_INVALID_ADAPTER_ID);
    assert!(config_hash.length() == 32, E_INVALID_CONFIG_HASH);

    let key = AdapterKey { venue, adapter_id_hash, version };
    let entry = AdapterEntry { adapter_program, config_hash, active };
    if (registry.entries.contains(key)) {
        *registry.entries.borrow_mut(key) = entry;
    } else {
        registry.entries.add(key, entry);
    };

    event::emit(AdapterUpdated {
        registry_id: object::id(registry),
        venue,
        version,
        adapter_program,
        active,
    });
}

public fun assert_adapter(
    registry: &AdapterRegistry,
    venue: u8,
    adapter_id_hash: vector<u8>,
    version: u64,
    config_hash: vector<u8>,
) {
    assert!(venue <= 2, E_INVALID_VENUE);
    assert!(version > 0, E_INVALID_VERSION);
    assert!(adapter_id_hash.length() == 32, E_INVALID_ADAPTER_ID);
    assert!(config_hash.length() == 32, E_INVALID_CONFIG_HASH);

    let key = AdapterKey { venue, adapter_id_hash, version };
    assert!(registry.entries.contains(key), E_ADAPTER_NOT_FOUND);
    let entry = registry.entries.borrow(key);
    assert!(entry.active, E_ADAPTER_DISABLED);
    assert!(entry.config_hash == config_hash, E_ADAPTER_MISMATCH);
}

public fun id(registry: &AdapterRegistry): ID { object::id(registry) }
public fun authority(registry: &AdapterRegistry): address { registry.authority }
