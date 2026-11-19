//! Shapes taken from the Cloud Sync plugin's own JSON, so the Rust reader
//! is tested against the wire, not against structs it wrote itself.

use textus_sync::protocol::{Base, History, Manifest};

const AB: &str = "fb8e20fc2e4c3f248c60c39bd652f3c1347298bb977b8b4d5903b85055620603";

#[test]
fn reads_the_plugins_manifest_shape() {
    let raw = format!(
        r#"{{"format":"textus-cloud-sync/1","revision":"r1","updatedAt":"2026-11-19T00:00:00Z","files":{{"Notes/a.md":{{"hash":"{AB}","size":2,"blocks":[{{"hash":"{AB}","size":2}}]}}}},"trash":[]}}"#
    );
    let manifest = Manifest::parse(raw.as_bytes()).unwrap();
    assert_eq!(manifest.revision, "r1");
    assert_eq!(manifest.files["Notes/a.md"].size, 2);
    assert!(Manifest::parse(manifest.to_json().unwrap().as_slice()).is_ok());
}

#[test]
fn reads_the_plugins_history_shape() {
    let raw = format!(
        r#"{{"format":"textus-cloud-sync/1","current":{{"Notes/a.md":{{"at":"2026-11-19T00:00:00Z","device":"phone"}}}},"versions":{{"Notes/a.md":[{{"hash":"{AB}","size":2,"blocks":[{{"hash":"{AB}","size":2}}],"at":"2026-11-18T00:00:00Z","device":"desktop","until":"2026-11-19T00:00:00Z"}}]}},"keep":{{"days":90,"at":"2026-11-19T00:00:00Z"}},"head":"r1","previous":"r0"}}"#
    );
    let history = History::parse(raw.as_bytes()).unwrap();
    assert_eq!(history.head.as_deref(), Some("r1"));
    assert_eq!(history.versions["Notes/a.md"][0].entry.size, 2);
    assert_eq!(history.keep.days, 90);
}

#[test]
fn reads_a_local_base_shape() {
    let raw = format!(
        r#"{{"format":"textus-cloud-sync/1","files":{{"Notes/a.md":"{AB}"}},"parked":{{}}}}"#
    );
    let base = Base::parse(raw.as_bytes()).unwrap();
    assert_eq!(base.files["Notes/a.md"], AB);
}

#[test]
fn refuses_a_manifest_with_a_twin_key_differing_only_in_case() {
    let raw = format!(
        r#"{{"format":"textus-cloud-sync/1","revision":"r","updatedAt":"now","files":{{"a.md":{{"hash":"{AB}","size":2,"blocks":[{{"hash":"{AB}","size":2}}]}},"A.md":{{"hash":"{AB}","size":2,"blocks":[{{"hash":"{AB}","size":2}}]}}}}}}"#
    );
    assert_eq!(
        Manifest::parse(raw.as_bytes()).unwrap_err().code,
        "invalidManifest"
    );
}
