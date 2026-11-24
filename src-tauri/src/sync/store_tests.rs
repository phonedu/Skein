use super::*;
use super::store_admin::*;
use super::store_ops::*;

    use super::*;

    fn legacy(root: &str, prefix: &str) -> (LegacyConfigs, LegacySecrets) {
        let key = hash_hex(root.as_bytes());
        let mut configs = BTreeMap::new();
        configs.insert(
            key.clone(),
            LegacyStored {
                root: root.to_string(),
                config: Config {
                    connection_id: String::new(),
                    provider: "webdav".to_string(),
                    endpoint: "https://dav.example.com".to_string(),
                    bucket: String::new(),
                    prefix: prefix.to_string(),
                    region: String::new(),
                    path_style: false,
                    s3_flavor: "standard".to_string(),
                    keep_days: 90,
                    keep_chosen: false,
                    encrypted: false,
                    vault_id: String::new(),
                },
            },
        );
        let mut secrets = BTreeMap::new();
        secrets.insert(
            key,
            Credentials {
                username: "u".to_string(),
                password: "p".to_string(),
                ..Credentials::default()
            },
        );
        (LegacyConfigs(configs), LegacySecrets(secrets))
    }

    #[test]
    fn an_old_folder_config_becomes_one_connection_and_binding() {
        let (legacy_configs, _) = legacy("C:/vault", "notes/work");
        let (store, secrets) = migrate(legacy_configs, LegacySecrets::default());
        assert_eq!(store.version, STORE_VERSION);
        assert_eq!(store.connections.len(), 1);
        assert_eq!(store.vaults.len(), 1);
        let binding = store.vaults.values().next().unwrap();
        assert_eq!(binding.prefix, "notes/work");
        assert_eq!(
            &binding.connection_id,
            store.connections.keys().next().unwrap()
        );
        assert!(secrets.connections.is_empty());
    }

    #[test]
    fn migration_brings_the_credentials_along() {
        let (legacy_configs, legacy_secrets) = legacy("C:/vault", "notes/work");
        let (store, secrets) = migrate(legacy_configs, legacy_secrets);
        let id = store.connections.keys().next().unwrap();
        assert_eq!(secrets.connections[id].username, "u");
    }

    #[test]
    fn a_new_shared_vault_gets_a_sub_repository() {
        let connection = Connection {
            id: "c-1".to_string(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: "notes".to_string(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
        };
        let prefix = new_prefix(
            &connection,
            Path::new("C:/Vaults/Work Notes"),
            "0123456789abcdef",
        );
        assert_eq!(prefix, "notes/work-notes-01234567");
    }

    #[test]
    fn the_old_file_shape_is_recognized_before_the_new_one() {
        let (configs, _) = legacy("C:/vault", "notes/work");
        let json = serde_json::to_vec(&configs).unwrap();
        assert!(matches!(
            serde_json::from_slice::<AnyStore>(&json).unwrap(),
            AnyStore::Legacy(_)
        ));
        let store = StoreFile::empty();
        let json = serde_json::to_vec(&store).unwrap();
        assert!(matches!(
            serde_json::from_slice::<AnyStore>(&json).unwrap(),
            AnyStore::Current(_)
        ));
    }

    #[test]
    fn a_vault_under_an_empty_base_gets_its_own_folder() {
        let connection = Connection {
            id: "c-1".to_string(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: String::new(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
        };
        assert_eq!(
            new_prefix(&connection, Path::new("C:/Vault/个人"), "abcdef0123"),
            "vault-abcdef01"
        );
    }

    #[test]
    fn webdav_may_have_an_empty_password_but_s3_may_not() {
        let webdav = Credentials {
            username: "u".to_string(),
            ..Credentials::default()
        };
        assert!(webdav.has_for("webdav"));
        assert!(!webdav.has_for("s3"));
    }

    fn test_paths(dir: &Path) -> StorePaths {
        let data = dir.join("data");
        std::fs::create_dir_all(&data).unwrap();
        StorePaths {
            config: dir.join("config/sync.json"),
            secrets: dir.join("config/sync_secrets.json"),
            data,
        }
    }

    fn base_of(paths: &StorePaths, root: &Path) -> PathBuf {
        let (store, _) = read_state(paths).unwrap();
        let (_, binding) = resolved_binding(&store, root).unwrap();
        paths.base_for(root, Some(&binding))
    }

    fn webdav_config() -> Config {
        Config {
            connection_id: String::new(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: String::new(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
            keep_days: 90,
            keep_chosen: false,
            encrypted: false,
            vault_id: String::new(),
        }
    }

    fn webdav_credentials() -> Credentials {
        Credentials {
            username: "u".to_string(),
            password: "p".to_string(),
            ..Credentials::default()
        }
    }

    #[test]
    fn a_saved_vault_reads_back_its_connection_and_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        let (config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(config.provider, "webdav");
        assert!(!config.connection_id.is_empty());
        assert_eq!(credentials.username, "u");
        let list = connection_list_at(&paths, &root).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["usedBy"], 1);
        assert_eq!(list[0]["current"], true);
        assert!(root.join(".textus/sync-vault.json").exists());
    }

    #[test]
    fn a_new_connection_binds_under_its_own_sub_repository() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();

        let (config, _) = load_at(&paths, &root).unwrap().unwrap();
        assert!(config.prefix.starts_with("vault-"));
        assert!(!config.prefix.is_empty());
    }

    #[test]
    fn a_new_hub_connection_keeps_the_hub_repository_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        let mut config = webdav_config();
        config.endpoint = "http://192.168.1.10:7419/hub/abc".to_string();
        save_at(&paths, &root, config, webdav_credentials()).unwrap();

        let (saved, _) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(saved.prefix, "");
    }

    #[test]
    fn a_second_vault_can_share_the_connection_and_gets_a_sub_repository() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let second = dir.path().join("vault2");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &first, webdav_config(), webdav_credentials()).unwrap();
        let (saved, _) = load_at(&paths, &first).unwrap().unwrap();
        let mut shared = webdav_config();
        shared.connection_id = saved.connection_id.clone();
        save_at(&paths, &second, shared, Credentials::default()).unwrap();

        let (bound, credentials) = load_at(&paths, &second).unwrap().unwrap();
        assert_eq!(bound.connection_id, saved.connection_id);
        assert!(bound.prefix.starts_with("vault2-"));
        assert_eq!(credentials.username, "u");
        let list = connection_list_at(&paths, &first).unwrap();
        assert_eq!(list[0]["usedBy"], 2);
    }

    #[test]
    fn changing_the_remote_prefix_rebuilds_the_base() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        save_base_at(&paths, &root, &Base::empty()).unwrap();
        assert!(base_of(&paths, &root).exists());

        let (mut config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        config.prefix = "another/repository".to_string();
        save_at(&paths, &root, config, credentials).unwrap();
        assert!(!base_of(&paths, &root).exists());
    }

    #[test]
    fn forgetting_the_last_vault_removes_its_connection() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        forget_at(&paths, &root).unwrap();
        assert!(load_at(&paths, &root).unwrap().is_none());
        assert!(connection_list_at(&paths, &root).unwrap().is_empty());
        let (store, secrets) = read_state(&paths).unwrap();
        assert!(store.connections.is_empty());
        assert!(secrets.connections.is_empty());
    }

    #[test]
    fn an_old_setup_loads_before_it_is_rewritten() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        std::fs::create_dir_all(paths.config.parent().unwrap()).unwrap();
        let key = root_key(&root);
        let mut configs = BTreeMap::new();
        configs.insert(
            key.clone(),
            LegacyStored {
                root: root.to_string_lossy().into_owned(),
                config: Config {
                    connection_id: String::new(),
                    prefix: "legacy/notes".to_string(),
                    ..webdav_config()
                },
            },
        );
        let mut secrets = BTreeMap::new();
        secrets.insert(key, webdav_credentials());
        std::fs::write(
            &paths.config,
            serde_json::to_vec(&LegacyConfigs(configs)).unwrap(),
        )
        .unwrap();
        std::fs::write(
            &paths.secrets,
            serde_json::to_vec(&LegacySecrets(secrets)).unwrap(),
        )
        .unwrap();

        let (config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(config.prefix, "legacy/notes");
        assert_eq!(credentials.username, "u");
        save_at(&paths, &root, config, credentials).unwrap();
        let saved: AnyStore =
            serde_json::from_slice(&std::fs::read(&paths.config).unwrap()).unwrap();
        assert!(matches!(saved, AnyStore::Current(_)));
    }

    #[test]
    fn editing_a_shared_connection_keeps_bindings_but_rebuilds_their_bases() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let second = dir.path().join("vault2");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let paths = test_paths(dir.path());
        let mut base = webdav_config();
        base.prefix = "work".to_string();
        save_at(&paths, &first, base, webdav_credentials()).unwrap();
        let (saved, _) = load_at(&paths, &first).unwrap().unwrap();
        let mut shared = webdav_config();
        shared.connection_id = saved.connection_id.clone();
        save_at(&paths, &second, shared, Credentials::default()).unwrap();
        save_base_at(&paths, &first, &Base::empty()).unwrap();
        save_base_at(&paths, &second, &Base::empty()).unwrap();
        let (before, _) = load_at(&paths, &second).unwrap().unwrap();

        let mut moved = webdav_config();
        moved.endpoint = "https://other.example.com".to_string();
        let outcome = update_connection_at(
            &paths,
            &saved.connection_id,
            moved,
            Credentials::default(),
            None,
        )
        .unwrap();
        assert!(outcome.contains("\"changed\":true"), "{outcome}");
        assert!(!base_of(&paths, &first).exists());
        assert!(!base_of(&paths, &second).exists());
        let (after, credentials) = load_at(&paths, &second).unwrap().unwrap();
        assert_eq!(after.endpoint, "https://other.example.com");
        assert_eq!(after.prefix, before.prefix);
        assert_eq!(credentials.username, "u");

        save_base_at(&paths, &second, &Base::empty()).unwrap();
        let rotated = Credentials {
            username: "u".to_string(),
            password: "new".to_string(),
            ..Credentials::default()
        };
        let mut same = webdav_config();
        same.endpoint = "https://other.example.com".to_string();
        let outcome =
            update_connection_at(&paths, &saved.connection_id, same, rotated, None).unwrap();
        assert!(outcome.contains("\"changed\":false"), "{outcome}");
        assert!(base_of(&paths, &second).exists());
        let (_, credentials) = load_at(&paths, &second).unwrap().unwrap();
        assert_eq!(credentials.password, "new");

        let mut same = webdav_config();
        same.endpoint = "https://other.example.com".to_string();
        update_connection_at(
            &paths,
            &saved.connection_id,
            same,
            Credentials::default(),
            Some("newbase"),
        )
        .unwrap();
        assert!(base_of(&paths, &second).exists());
        let (store, _) = read_state(&paths).unwrap();
        assert_eq!(store.connections[&saved.connection_id].prefix, "newbase");
    }

    #[test]
    fn an_old_root_keyed_base_moves_to_the_repository_name_on_save() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        let (mut store, secrets) = read_state(&paths).unwrap();
        let key = root_key(&root);
        store.vaults.get_mut(&key).unwrap().vault_id.clear();
        store.vaults.get_mut(&key).unwrap().repository_id.clear();
        write_state(&paths, &store, &secrets).unwrap();
        save_base_at(&paths, &root, &Base::empty()).unwrap();
        assert!(paths.base(&root).exists());

        let (config, credentials) = load_at(&paths, &root).unwrap().unwrap();
        save_at(&paths, &root, config, credentials).unwrap();
        assert!(!paths.base(&root).exists());
        assert!(base_of(&paths, &root).exists());
    }

    #[test]
    fn a_moved_vault_keeps_its_base_and_rebinds_to_the_new_folder() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let moved = dir.path().join("vault moved");
        std::fs::create_dir_all(&first).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &first, webdav_config(), webdav_credentials()).unwrap();
        save_base_at(&paths, &first, &Base::empty()).unwrap();
        let old_key = root_key(&first);
        let (store, _) = read_state(&paths).unwrap();
        let old_repository = store.vaults[&old_key].repository_id.clone();
        let base = base_of(&paths, &first);
        assert!(base.exists());

        std::fs::rename(&first, &moved).unwrap();
        let (config, credentials) = load_at(&paths, &moved).unwrap().unwrap();
        assert_eq!(base_of(&paths, &moved), base);
        assert!(base.exists());

        save_at(&paths, &moved, config, credentials).unwrap();
        let (store, _) = read_state(&paths).unwrap();
        assert!(!store.vaults.contains_key(&old_key));
        let binding = &store.vaults[&root_key(&moved)];
        assert_eq!(Path::new(&binding.root), moved.as_path());
        assert_eq!(binding.repository_id, old_repository);
        assert!(base.exists());
    }

    #[test]
    fn an_encrypted_vault_keeps_its_password_out_of_the_connection() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        let mut config = webdav_config();
        config.encrypted = true;
        let credentials = Credentials {
            sync_password: "correct horse battery".to_string(),
            ..webdav_credentials()
        };
        save_at(&paths, &root, config, credentials).unwrap();
        let (saved, connection_credentials) = load_at(&paths, &root).unwrap().unwrap();
        assert!(saved.encrypted);
        assert!(connection_credentials.sync_password.is_empty());
        let (_, secrets) = read_state(&paths).unwrap();
        assert_eq!(
            secrets.vaults[&saved.vault_id].sync_password,
            "correct horse battery"
        );

        let mut again = webdav_config();
        again.encrypted = true;
        save_at(&paths, &root, again, webdav_credentials()).unwrap();
        let (_, secrets) = read_state(&paths).unwrap();
        assert_eq!(
            secrets.vaults[&saved.vault_id].sync_password,
            "correct horse battery"
        );

        forget_at(&paths, &root).unwrap();
        let (_, secrets) = read_state(&paths).unwrap();
        assert!(secrets.vaults.is_empty());
    }

    #[test]
    fn a_copied_vault_is_asked_to_fork_before_it_binds() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let copy = dir.path().join("vault copy");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&copy).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &first, webdav_config(), webdav_credentials()).unwrap();
        std::fs::create_dir_all(copy.join(".textus")).unwrap();
        std::fs::copy(
            first.join(".textus/sync-vault.json"),
            copy.join(".textus/sync-vault.json"),
        )
        .unwrap();

        let error = save_at(&paths, &copy, webdav_config(), webdav_credentials()).unwrap_err();
        assert!(error.contains("vaultCopied"), "{error}");
        fork_at(&paths, &copy).unwrap();
        let (first_config, _) = load_at(&paths, &first).unwrap().unwrap();
        let mut shared = webdav_config();
        shared.connection_id = first_config.connection_id.clone();
        save_at(&paths, &copy, shared, Credentials::default()).unwrap();
        let (copy_config, _) = load_at(&paths, &copy).unwrap().unwrap();
        assert_eq!(first_config.connection_id, copy_config.connection_id);
        assert_ne!(first_config.prefix, copy_config.prefix);
    }

    #[test]
    fn two_vaults_cannot_bind_the_same_repository() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("vault");
        let second = dir.path().join("vault2");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let paths = test_paths(dir.path());
        let mut base = webdav_config();
        base.prefix = "work".to_string();
        save_at(&paths, &first, base, webdav_credentials()).unwrap();
        let (saved, _) = load_at(&paths, &first).unwrap().unwrap();
        let mut same = webdav_config();
        same.connection_id = saved.connection_id;
        same.prefix = "work".to_string();
        let error = save_at(&paths, &second, same, Credentials::default()).unwrap_err();
        assert!(error.contains("repositoryInUse"), "{error}");
    }

    #[test]
    fn the_new_choice_makes_a_second_connection() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        save_at(&paths, &root, webdav_config(), webdav_credentials()).unwrap();
        let (first, _) = load_at(&paths, &root).unwrap().unwrap();
        let mut next = webdav_config();
        next.connection_id = "new".to_string();
        next.endpoint = "https://other.example.com".to_string();
        save_at(&paths, &root, next, webdav_credentials()).unwrap();
        let (second, _) = load_at(&paths, &root).unwrap().unwrap();
        assert_ne!(first.connection_id, second.connection_id);
        let (store, _) = read_state(&paths).unwrap();
        assert_eq!(store.connections.len(), 1);
        assert_eq!(second.endpoint, "https://other.example.com");
    }

    #[test]
    fn a_prefix_must_be_repository_relative() {
        let credentials = Credentials {
            username: "u".to_string(),
            password: "p".to_string(),
            ..Credentials::default()
        };
        let connection = Connection {
            id: "c-1".to_string(),
            provider: "webdav".to_string(),
            endpoint: "https://dav.example.com".to_string(),
            bucket: String::new(),
            prefix: "../notes".to_string(),
            region: String::new(),
            path_style: false,
            s3_flavor: "standard".to_string(),
        };
        assert!(validate_connection(&connection).is_err());
        assert!(validate_credentials("webdav", &credentials).is_ok());
    }


    #[test]
    fn a_kodo_connection_needs_a_known_qiniu_region() {
        let kodo = |region: &str| Connection {
            id: "c-kodo".to_string(),
            provider: "s3".to_string(),
            endpoint: "https://s3.cn-south-1.qiniucs.com".to_string(),
            bucket: "bucket".to_string(),
            prefix: String::new(),
            region: region.to_string(),
            path_style: true,
            s3_flavor: "kodo".to_string(),
        };
        assert!(validate_connection(&kodo("cn-south-1")).is_ok());
        assert_eq!(
            validate_connection(&kodo("eu-west-1")).unwrap_err(),
            SyncError::new("unsupportedRegion").to_string()
        );
    }

    #[test]
    fn a_kodo_vault_saves_its_flavor_region_and_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        let mut config = webdav_config();
        config.provider = "s3".to_string();
        config.endpoint = "https://s3.cn-south-1.qiniucs.com".to_string();
        config.bucket = "bucket".to_string();
        config.region = "cn-south-1".to_string();
        config.path_style = true;
        config.s3_flavor = "kodo".to_string();
        let credentials = Credentials {
            access_key: "ak".to_string(),
            secret_key: "sk".to_string(),
            ..Credentials::default()
        };
        save_at(&paths, &root, config, credentials).unwrap();

        let (saved, credentials) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(saved.s3_flavor, "kodo");
        assert_eq!(saved.region, "cn-south-1");
        assert_eq!(credentials.access_key, "ak");
        let list = connection_list_at(&paths, &root).unwrap();
        assert_eq!(list[0]["provider"], "s3");
        assert_eq!(list[0]["s3Flavor"], "kodo");
    }

    #[test]
    fn kodo_takes_its_endpoint_from_the_region_only() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        let mut config = webdav_config();
        config.provider = "s3".to_string();
        // An address from another provider (or an old setup) is not kept.
        config.endpoint = "https://wrong.example.com".to_string();
        config.bucket = "bucket".to_string();
        config.region = "CN-SOUTH-1".to_string();
        config.path_style = false;
        config.s3_flavor = "kodo".to_string();
        let credentials = Credentials {
            access_key: "ak".to_string(),
            secret_key: "sk".to_string(),
            ..Credentials::default()
        };
        save_at(&paths, &root, config, credentials).unwrap();
        let (saved, _) = load_at(&paths, &root).unwrap().unwrap();
        assert_eq!(saved.region, "cn-south-1");
        assert_eq!(saved.endpoint, "https://s3.cn-south-1.qiniucs.com");
        assert!(saved.path_style);
    }

    #[test]
    fn a_kodo_vault_without_a_region_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        let paths = test_paths(dir.path());
        let mut config = webdav_config();
        config.provider = "s3".to_string();
        config.endpoint = "https://s3.cn-south-1.qiniucs.com".to_string();
        config.bucket = "bucket".to_string();
        config.region = String::new();
        config.s3_flavor = "kodo".to_string();
        let credentials = Credentials {
            access_key: "ak".to_string(),
            secret_key: "sk".to_string(),
            ..Credentials::default()
        };
        assert!(save_at(&paths, &root, config, credentials)
            .unwrap_err()
            .contains("regionRequired"));
    }
