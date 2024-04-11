import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import {
  FormGroup,
  FormBuilder,
  Validators,
  FormControl,
  FormArray,
  AbstractControl,
} from '@angular/forms';
import { MonitoringObject } from '../../class/monitoring-object';
// import { Router } from "@angular/router";
import { ConfigService } from '../../services/config.service';
import { DataUtilsService } from '../../services/data-utils.service';
import { CommonService } from '@geonature_common/service/common.service';
import { DynamicFormService } from '@geonature_common/form/dynamic-form-generator/dynamic-form.service';
import { ActivatedRoute } from '@angular/router';
import { JsonData } from '../../types/jsondata';
import { SitesService } from '../../services/api-geom.service';
import {
  concatMap,
  distinctUntilChanged,
  mergeMap,
  switchMap,
  tap,
  map,
  reduce,
  filter,
  defaultIfEmpty,
  scan,
} from 'rxjs/operators';
import { defer, forkJoin, from, iif, of } from 'rxjs';
import { FormService } from '../../services/form.service';
import { Router } from '@angular/router';
import { TOOLTIPMESSAGEALERT } from '../../constants/guard';
import { GeoJSONService } from '../../services/geojson.service';

@Component({
  selector: 'pnx-monitoring-form',
  templateUrl: './monitoring-form.component.html',
  styleUrls: ['./monitoring-form.component.css'],
})
export class MonitoringFormComponent implements OnInit {
  @Input() currentUser;

  @Input() objForm: FormGroup;

  @Input() obj: MonitoringObject;
  @Output() objChanged = new EventEmitter<MonitoringObject>();

  @Input() objectsStatus;
  @Output() objectsStatusChange = new EventEmitter<Object>();

  @Input() bEdit: boolean;
  @Output() bEditChange = new EventEmitter<boolean>();

  @Input() sites: {};

  searchSite = '';

  objFormsDefinition;

  meta: JsonData = {};

  // objFormDynamic: FormGroup = this._formBuilder.group({});
  // objFormsDefinitionDynamic;

  objFormsDynamic: { [key: string]: FormGroup } = {};
  objFormsDefinitionDynamic: { [key: string]: any } = {};

  allTypesSiteConfig: JsonData = {};
  typesSiteConfig: JsonData = {};
  specificConfig: JsonData = {};
  confiGenericSpec: JsonData = {};
  schemaUpdate = {};
  // idsTypesSite: number[] = [];
  idsTypesSite: Set<number> = new Set<number>();
  lastGeom = {};
  dataComplement = {};
  schemaGeneric = {};
  // confiGenericSpec = {};

  public bSaveSpinner = false;
  public bSaveAndAddChildrenSpinner = false;
  public bDeleteSpinner = false;
  public bDeleteModal = false;
  public bChainInput = false;
  public bAddChildren = false;
  public chainShow = [];

  public queryParams = {};

  geomCalculated: boolean = false;
  canDelete: boolean;
  canUpdate: boolean;
  toolTipNotAllowed: string = TOOLTIPMESSAGEALERT;

  isSiteObject: boolean = false;
  isEditObject: boolean = false;
  displayProperties: string[] = [];
  hasDynamicGroups: boolean = false;

  constructor(
    private _formBuilder: FormBuilder,
    private _route: ActivatedRoute,
    private _configService: ConfigService,
    private _commonService: CommonService,
    private _dataUtilsService: DataUtilsService,
    private _dynformService: DynamicFormService,
    private _siteService: SitesService,
    private _formService: FormService,
    private _router: Router,
    private _geojsonService: GeoJSONService
  ) {}

  ngOnInit() {
    this.initPermission();
    this._configService
      .init(this.obj.moduleCode)
      .pipe(
        map(() => {
          this.isSiteObject = this.obj.objectType === 'site';
          this.isEditObject = this.obj.id !== undefined && this.obj.id !== null;
          console.log(
            '1- CHECK TYPE OBJECT AND EDIT or NOT',
            `Object type is ${this.obj.objectType} and is Edit Object ? ${this.isEditObject}`
          );
          return of(null);
        }),
        switchMap((_) =>
          // Initialisation des config
          iif(
            () => this.isSiteObject,
            // CONDITION avec types de site
            this.initTypeSiteConfig(
              this.obj.config['specific'],
              this.obj['properties'],
              this.obj.config['types_site']
            ).pipe(
              concatMap(({ idsTypesSite, typesSiteConfig }) => {
                idsTypesSite.forEach((number) => this.idsTypesSite.add(number));
                this.allTypesSiteConfig = typesSiteConfig;
                return this.initSpecificConfig(
                  this.obj.config['specific'],
                  this.obj.config['types_site']
                );
              }),
              concatMap((specificConfig) => {
                // Initialisation des formGroup Dynamic
                const objFiltered = this.filterObject(this.allTypesSiteConfig, Array.from(this.idsTypesSite))
                for (const typeSite in objFiltered) {
                  this.addDynamicFormGroup(typeSite);
                }
        
                return of(specificConfig);
              }),
              concatMap((specificConfig) => {
                this.specificConfig = specificConfig;
                this.confiGenericSpec = this.mergeObjects(
                  this.specificConfig,
                  this.obj.config['generic']
                );
                return of(null);
              })
            ),
            // CONDITION sans types de site
            this.initSpecificConfig(this.obj.config['specific']).pipe(
              concatMap((specificConfig) => {
                this.specificConfig = specificConfig;
                this.confiGenericSpec = this.mergeObjects(
                  this.specificConfig,
                  this.obj.config['generic']
                );
                return of(null);
              })
            )
          ).pipe(
            tap((_) => {
              // Initialize objForm based on isSiteObject condition
              if (this.isSiteObject) {
                this.addMultipleFormGroupsToObjForm(this.objFormsDynamic, this.objForm);
              }
            }),
            tap((_) => {
              // Perform further actions based on the result of the tap operator
              if(this.isEditObject && this.isSiteObject){
                this.hasDynamicGroups = this.obj.properties['types_site'].length > 0
              }
            })
          )
        ),
        map((_) => {
          // Initialisation des variables queryParams , bChainInput
          console.log('Initialisation des variables queryParams , bChainInput');
          this.queryParams = this._route.snapshot.queryParams || {};
          this.bChainInput = this._configService.frontendParams()['bChainInput'];
          this.meta = {
            nomenclatures: this._dataUtilsService.getDataUtil('nomenclature'),
            dataset: this._dataUtilsService.getDataUtil('dataset'),
            id_role: this.currentUser.id_role,
            bChainInput: this.bChainInput,
            parents: this.obj.parents,
          };
        }),
        concatMap((_) =>
          // Initialisation definition des champs de l'object objForm
          {
            console.log("Initialisation definition des champs de l'object objForm ");
            return this.initObjFormDefiniton(this.confiGenericSpec, this.meta).pipe(
              map((objFormDefinition) => {
                this.objFormsDefinition = objFormDefinition;
                return null; // Return a value to continue the chain
              })
            );
          }
        ),
        switchMap((_) =>
          // Initialisation definition des champs de l'object objFormDynamic
          iif(
            () => this.isSiteObject,
            from(Object.entries(this.allTypesSiteConfig)).pipe(
              concatMap(([typeSite, config]) => {
                return this.initObjFormDefiniton(config, this.meta).pipe(
                  map((objFormDefinition) => {
                    console.log(
                      'Initialization of dynamic form definition for',
                      typeSite,
                      objFormDefinition
                    );
                    this.objFormsDefinitionDynamic[typeSite] = objFormDefinition;
                    return typeSite;
                  })
                );
              }),
              concatMap((typeSite) => {
                return this.sortObjFormDefinition(
                  this.displayProperties,
                  this.objFormsDefinitionDynamic[typeSite]
                ).pipe(
                  tap((objFormsDefinitionDynamic) => {
                    console.log(
                      "Initialisation de l'ordre d'affichage des champs objFormsDefinitionDynamic"
                    ),
                      (this.objFormsDefinitionDynamic[typeSite] = objFormsDefinitionDynamic);
                  })
                );
              })
            ),
            of(null)
          )
        ),
        concatMap((_) => {
          // Initialisation de l'ordre d'affichage des champs objForDefinition
          console.log("Initialisation de l'ordre d'affichage des champs objForDefinition");
          this.displayProperties = [...(this.obj.configParam('display_properties') || [])];
          this.sortObjFormDefinition(this.displayProperties, this.objFormsDefinition).pipe(
            tap((objFormsDefinition) => (this.objFormsDefinition = objFormsDefinition))
          );
          console.log('this.objFormsDefinition :', this.objFormsDefinition);
          return of(null);
        }),
        concatMap((_) => {
          // Ajout du champ géométrique à l'object form et du champ patch
          console.log("Ajout du champ géométrique à l'object form et du champ patch");
          return this.addFormCtrlToObjForm(
            { frmCtrl: this._formBuilder.control(0), frmName: 'patch_update' },
            this.objForm
          ).pipe(
            concatMap((objForm) => {
              // set geometry
              if (this.obj.config['geometry_type']) {
                const validatorRequired =
                  this.obj.objectType == 'sites_group'
                    ? this._formBuilder.control('')
                    : this._formBuilder.control('', Validators.required);
                let frmCtrlGeom = {
                  frmCtrl: validatorRequired,
                  frmName: 'geometry',
                };
                return this.addFormCtrlToObjForm(frmCtrlGeom, objForm);
              }
              return of(objForm);
            })
          );
        }),
        concatMap((objForm) => {
          this.objForm = objForm;
          this.geomCalculated = this.obj.properties.hasOwnProperty('is_geom_from_child')
            ? this.obj.properties['is_geom_from_child']
            : false;
          this.geomCalculated ? (this.obj.geometry = null) : null;
          this.bEdit
            ? this._geojsonService.setCurrentmapData(this.obj.geometry, this.geomCalculated)
            : null;
          return of(null);
        }),
        concatMap((_) => {
          console.log('setQueryParams');
          return this.setQueryParams(this.obj);
        }),
        concatMap((obj) => {
          this.obj = obj;
          // On match les valeurs de l'objet en lien avec l'object Form et ensuite on patch l'object form
          console.log(
            " On match les valeurs de l'objet en lien avec l'object Form et ensuite on patch l'object form"
          );
          return of(obj)
        }),
        switchMap((obj) => {
          const initObjFormValues$ = this.initObjFormValues(this.obj, this.confiGenericSpec, Array.from(this.idsTypesSite));
        
          return initObjFormValues$.pipe(
            concatMap(genericFormValues => {
              const specificValues$ = defer(() => {
                if (this.isSiteObject && !this.isEditObject) {
                  return this.initObjFormSpecificValues(this.obj, this.allTypesSiteConfig).pipe(defaultIfEmpty(null));
                } else if (this.isSiteObject && this.isEditObject) {
                  const filteredTypesSiteConfig = this.filterObject(this.allTypesSiteConfig, Array.from(this.idsTypesSite));
                  return this.initObjFormSpecificValues(this.obj, filteredTypesSiteConfig).pipe(defaultIfEmpty(null));
                } else {
                  return of(null);
                }
              });
        
              return specificValues$.pipe(
                tap((specificFormValues) => {
                  console.log("Patching the object form values");
                  this.objForm.patchValue(genericFormValues);
                  if (specificFormValues !== null) {
                    this.patchValuesInDynamicGroups(specificFormValues);
                  }
                })
              );
            })
          );
        })
      )
      .subscribe(() => {
        console.log(' ObjForm Initialisé');
        console.log(this.objForm);
        console.log(' ObjFormDynamic Initialisé');
        console.log(this.objFormsDynamic);

        const dynamicGroupsArray = this.objForm.get('dynamicGroups') as FormArray;
        this.subscribeToDynamicGroupsChanges(dynamicGroupsArray);
      });
  }

  subscribeToDynamicGroupsChanges(dynamicGroupsArray: FormArray): void {
    dynamicGroupsArray.valueChanges.pipe(
      scan((prevLength, currentValue) => dynamicGroupsArray.controls.length, 0),
      distinctUntilChanged()
    ).subscribe((length) => {
      this.hasDynamicGroups = length > 0;
    });
  }
  
  /** pour réutiliser des paramètres déjà saisis */
  keepDefinitions() {
    return this.objFormsDefinition.filter((def) =>
      this.obj.configParam('keep').includes(def.attribut_name)
    );
  }

  setQueryParams(obj: MonitoringObject) {
    // par le biais des parametre query de route on donne l'id du ou des parents
    // permet d'avoir un 'tree' ou un objet est sur plusieurs branches
    // on attend des ids d'où test avec parseInt
    for (const key of Object.keys(this.queryParams)) {
      const strToInt = parseInt(this.queryParams[key]);
      if (!Number.isNaN(strToInt)) {
        obj.properties[key] = strToInt;
      }
    }
    return of(obj);
  }

  /** initialise le formulaire quand le formulaire est prêt ou l'object est prêt */
  initForm() {
    if (!(this.objForm && this.obj.bIsInitialized)) {
      return;
    }
    this._formService
      .formValues(this.obj, this.confiGenericSpec)
      .pipe(
        map((genericFormValues) => {
          genericFormValues['types_site'] = Array.from(this.idsTypesSite);
          return genericFormValues;
        })
      )
      .subscribe((formValue) => {
        this.objForm.patchValue(formValue);
        this.setDefaultFormValue();
      });
  }

  initFormDynamic(typeSite: string) {
    if (!(this.objFormsDynamic[typeSite] && this.obj.bIsInitialized)) {
      return;
    }
    // pour donner la valeur de l'objet au formulaire
    this._formService
      .formValues(this.obj, this.allTypesSiteConfig[typeSite])
      .subscribe((formValue) => {
        this.patchValuesInDynamicGroups(formValue);
      });
  }
  keepNames() {
    return this.obj.configParam('keep') || [];
  }

  resetObjForm() {
    // quand on enchaine les relevés
    const chainShow = this.obj.configParam('chain_show');
    if (chainShow) {
      this.chainShow.push(chainShow.map((key) => this.obj.resolvedProperties[key]));
      this.chainShow.push(this.obj.resolvedProperties);
    }

    // les valeur que l'on garde d'une saisie à l'autre
    const keep = {};
    for (const key of this.keepNames()) {
      keep[key] = this.obj.properties[key];
    }

    // nouvel object
    this.obj = new MonitoringObject(
      this.obj.moduleCode,
      this.obj.objectType,
      null,
      this.obj.monitoringObjectService()
    );
    this.obj.init({});

    this.obj.properties[this.obj.configParam('id_field_Name')] = null;

    // pq get ?????
    // this.obj.get(0).subscribe(() => {
    this.obj.bIsInitialized = true;
    for (const key of this.keepNames()) {
      this.obj.properties[key] = keep[key];
    }

    this.objChanged.emit(this.obj);
    this.objForm.patchValue({ geometry: null });
    this.initForm();
    // });
  }

  /** Pour donner des valeurs par defaut si la valeur n'est pas définie
   * id_digitiser => current_user.id_role
   * id_inventor => current_user.id_role
   * date => today
   */
  setDefaultFormValue() {
    const value = this.objForm.value;
    const date = new Date();
    const defaultValue = {
      id_digitiser: value['id_digitiser'] || this.currentUser.id_role,
      id_inventor: value['id_inventor'] || this.currentUser.id_role,
      first_use_date: value['first_use_date'] || {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      },
    };
    this.objForm.patchValue(defaultValue);
  }

  /**
   * TODO faire des fonctions dans monitoring objet (ou moniotring objet service pour naviguer
   */

  /**
   * Valider et renseigner les enfants
   */
  navigateToAddChildren() {
    this.bEditChange.emit(false);
    this.obj.navigateToAddChildren();
  }

  /**
   * Valider et aller à la page de l'objet
   */
  navigateToDetail() {
    this.bEditChange.emit(false); // patch bug navigation
    this.obj.navigateToDetail();
  }

  /**
   * Valider et aller à la page de l'objet
   */
  navigateToParent() {
    this.bEditChange.emit(false); // patch bug navigation
    this.obj.navigateToParent();
  }

  msgToaster(action) {
    return `${action} ${this.obj.labelDu()} ${this.obj.description()} effectuée`.trim();
  }

  /** TODO améliorer site etc.. */
  onSubmit(isAddChildrend = false) {
    isAddChildrend
      ? (this.bSaveAndAddChildrenSpinner = this.bAddChildren = true)
      : (this.bSaveSpinner = true);
    // if (this.obj.objectType == 'site') {
    //   this.dataComplement = { ...this.typesSiteConfig, types_site: this.idsTypesSite };
    // }
    let objFormValueGroup = {};
    this.obj.objectType == 'site'
      ? (objFormValueGroup = this.flattenFormGroup(this.objForm))
      : (objFormValueGroup = this.objForm.value);
    // this.obj.objectType == 'site'
    //   ? Object.assign(this.obj.config['specific'], this.schemaUpdate)
    //   : null;
    const action = this.obj.id
      ? this.obj.patch(objFormValueGroup)
      : this.obj.post(objFormValueGroup);
    const actionLabel = this.obj.id ? 'Modification' : 'Création';
    action.subscribe((objData) => {
      this._commonService.regularToaster('success', this.msgToaster(actionLabel));
      this.bSaveSpinner = this.bSaveAndAddChildrenSpinner = false;
      this.objChanged.emit(this.obj);

      /** si c'est un module : reset de la config */
      if (this.obj.objectType === 'module') {
        this._configService.loadConfig(this.obj.moduleCode).subscribe();
      }

      if (this.bChainInput) {
        this.resetObjForm();
      } else if (this.bAddChildren) {
        this.navigateToAddChildren();
      } else {
        if (this.obj.configParam('redirect_to_parent')) {
          this.navigateToParent();
        } else {
          this.navigateToDetail();
        }
      }
    });
  }

  onCancelEdit() {
    if (this.obj.id) {
      const urlTree = this._router.parseUrl(this._router.url);
      const urlWithoutParams = urlTree.root.children['primary'].segments
        .map((it) => it.path)
        .join('/');
      this._router.navigate([urlWithoutParams]);

      // this._geojsonService.removeAllFeatureGroup();
      this.obj.geometry == null
        ? this._geojsonService.setMapDataWithFeatureGroup([this._geojsonService.sitesFeatureGroup])
        : this._geojsonService.setMapBeforeEdit(this.obj.geometry);
      this.bEditChange.emit(false);
    } else {
      this.navigateToParent();
    }
  }

  onDelete() {
    this.bDeleteSpinner = true;
    this.obj.delete().subscribe((objData) => {
      this.bDeleteSpinner = this.bDeleteModal = false;
      this.obj.deleted = true;
      this.objChanged.emit(this.obj);
      this._commonService.regularToaster('info', this.msgToaster('Suppression'));
      setTimeout(() => {
        this.navigateToParent();
      }, 100);
    });
  }

  onObjFormValueChange(event) {
    console.log('CHANGE MAIN FORM');
    // Check si types_site est modifié
    if (event.types_site != null && event.types_site.length != this.idsTypesSite.size) {
      this.updateTypeSiteForm().subscribe((_) => {
        this.objForm = this.addMultipleFormGroupsToObjForm(this.objFormsDynamic, this.objForm);
      });
    }
    const change = this.obj.change();
    if (!change) {
      return;
    }
    setTimeout(() => {
      change({ objForm: this.objForm, meta: this.meta });
    }, 100);
  }

  onObjFormValueChangeDynamic(event, typeSite) {
    console.log('CHANGE DYNAMIC');
    this.objForm = this.addMultipleFormGroupsToObjForm(this.objFormsDynamic, this.objForm);
    const change = this.obj.change();
    if (!change) {
      return;
    }
    setTimeout(() => {
      change({ objForm: this.objFormsDynamic[typeSite], meta: this.meta });
    }, 100);
  }

  procesPatchUpdateForm() {
    this.objForm.patchValue({ patch_update: this.objForm.value.patch_update + 1 });
  }

  /** bChainInput gardé dans config service */
  bChainInputChanged() {
    for (const formDef of this.objFormsDefinition) {
      formDef.meta.bChainInput = this.bChainInput;
    }
    this._configService.setFrontendParams('bChainInput', this.bChainInput);
    // patch pour recalculers
    this.procesPatchUpdateForm();
  }

  updateTypeSiteForm() {
    return this.objForm.controls['types_site'].valueChanges.pipe(
      distinctUntilChanged(),
      switchMap((idsTypesSite) =>
        iif(
          () => idsTypesSite == undefined || idsTypesSite.length == 0,
          of({}),
          from(idsTypesSite).pipe(
            mergeMap((idTypeSite: number) => {
              return of({ [idTypeSite]: this.allTypesSiteConfig[idTypeSite] });
            }),
            reduce((acc, cur) => ({ ...acc, ...cur }), {})
          )
        )
      ),
      filter((typesSiteObject) => {
        // Ici on filtre pour empêcher de continuer l'enchainement cascade des opérations suivant si la liste des types de site est vide
        const isTypeSelectedEmpty =
          typesSiteObject === null || Object.keys(typesSiteObject).length === 0;
        if (isTypeSelectedEmpty) {
          this.idsTypesSite = new Set<number>();
          this.removeAllDynamicGroups();
        }
        return !isTypeSelectedEmpty;
      }),
      tap((typesSiteObject) => {
        this.typesSiteConfig = typesSiteObject;
        this.idsTypesSite = new Set<number>(Object.keys(typesSiteObject).map(Number)); // Update idsTypesSite with the keys of filteredTypeSiteConfig
      }),
      concatMap(() => {
        const keys = Object.keys(this.typesSiteConfig);

        // Create or update form groups for each typeSite
        keys.forEach((typeSite) => {
          if (!this.objFormsDynamic[typeSite]) {
            // Si dans la liste de type de site un nouveau type de site est ajouté alors on créé un formGroup
            this.objFormsDynamic[typeSite] = this._formBuilder.group({});
          }
        });

        // Si la nouvelle liste de type de site ne match pas avec la liste de "keys" du objFormDynamic on supprime
        Object.keys(this.objFormsDynamic).forEach((key) => {
          if (!keys.includes(key)) {
            delete this.objFormsDynamic[key];
          }
        });
        console.log('Initialisation objFormsDynamic avec comme keys:', keys);

        return forkJoin(
          keys.map((typeSite) => {
            return this.initObjFormDefiniton(this.typesSiteConfig[typeSite], this.meta).pipe(
              tap((objFormDefinition) => {
                console.log(
                  'Initialisation de l objFormDefinition basé sur les nouveaux types de sites',
                  typeSite,
                  objFormDefinition
                );
                this.objFormsDefinitionDynamic[typeSite] = objFormDefinition;
              })
            );
          })
        );
      })
      // TODO: VERIFIER SI NECESSAIRE (A PRIORI à l'ajout de site non mais peut être nécessaire si
      // on veut garder les valeurs qui étaient présente pour l'édition d'un site)
      // concatMap(() => {
      //   return forkJoin(
      //     Object.entries(this.typesSiteConfig).map(([typeSite, config]) => {
      //       return this.initObjFormSpecificValues(this.obj, config).pipe(
      //         map((formValue) => ({
      //           typeSite,
      //           formValue
      //         }))
      //       );
      //     })
      //   ).pipe(
      //     tap(() => console.log('All initObjFormSpecificValues completed'))
      //   );
      // }),
      // map((results) => {
      //   results.forEach(({ typeSite, formValue }) => {
      //     this.objFormsDynamic[typeSite].patchValue(formValue);
      //   });
      //   console.log('All operations completed');
      //   return results;
      // })
    );
  }

  initPermission() {
    this.canDelete =
      this.obj.objectType == 'module'
        ? this.currentUser?.moduleCruved[this.obj.objectType]['D'] > 0
        : this.obj.cruved['D'] && !['site', 'sites_group'].includes(this.obj.objectType);
    this.canUpdate =
      this.obj.objectType == 'module'
        ? this.currentUser?.moduleCruved[this.obj.objectType]['U'] > 0
        : this.obj.cruved['U'];
  }

  notAllowedMessage() {
    this._commonService.translateToaster(
      'warning',
      "Vous n'avez pas les permissions nécessaires pour éditer l'objet"
    );
  }

  addGeomFormCtrl(frmCtrl: { frmCtrl: FormControl; frmName: string }) {
    if (frmCtrl.frmName in this.objForm.controls) {
    } else {
      this.objForm.addControl(frmCtrl.frmName, frmCtrl.frmCtrl);
    }
  }

  addFormCtrlToObjForm(frmCtrl: { frmCtrl: FormControl; frmName: string }, objForm) {
    if (frmCtrl.frmName in objForm.controls) {
    } else {
      objForm.addControl(frmCtrl.frmName, frmCtrl.frmCtrl);
    }
    return of(objForm);
  }

  initObjFormDefiniton(schema: JsonData, meta: JsonData) {
    const objectFormDefiniton = this._dynformService
      .formDefinitionsdictToArray(schema, this.meta)
      .filter((formDef) => formDef.type_widget)
      .sort((a, b) => {
        if (a.attribut_name === 'types_site') return 1;
        if (b.attribut_name === 'types_site') return -1;
        if (a.attribut_name === 'medias') return 1;
        if (b.attribut_name === 'medias') return -1;
        return 0;
      });
    return of(objectFormDefiniton);
  }

  initTypeSiteConfig(configSpecific, properties, configTypesSite) {
    const idsTypesSite = [];
    const typesSiteConfig = {};
    for (const keyTypeSite in configTypesSite) {
      typesSiteConfig[keyTypeSite] = {};
      let typeSiteName = configTypesSite[keyTypeSite].name;
      for (const prop of configTypesSite[keyTypeSite].display_properties) {
        typesSiteConfig[keyTypeSite][prop] = configSpecific[prop];
      }
      properties['types_site'].includes(typeSiteName)
        ? idsTypesSite.push(parseInt(keyTypeSite))
        : null;
    }
    return of({ idsTypesSite, typesSiteConfig });
  }

  initSpecificConfig(configSpecific, configTypesSite = {}) {
    let specificConfig = {};
    if (configTypesSite) {
      const allTypeSiteConfigCombined = Object.assign(
        {},
        ...Object.values(this.allTypesSiteConfig)
      );
      specificConfig = this.getRemainingProperties(allTypeSiteConfigCombined, configSpecific);
    } else {
      specificConfig = configSpecific;
    }
    return of(specificConfig);
  }

  sortObjFormDefinition(displayProperties: string[], objFormDef: JsonData) {
    // let displayProperties = [...(this.obj.configParam('display_properties') || [])];
    // TODO: Vérifier mais normalement plus nécessaire d'utiliser cette évaluation de condition (objFormDef ne devrait pas être nul ici)
    if (!objFormDef) return;
    if (displayProperties && displayProperties.length) {
      displayProperties.reverse();
      objFormDef.sort((a, b) => {
        let indexA = displayProperties.findIndex((e) => e == a.attribut_name);
        let indexB = displayProperties.findIndex((e) => e == b.attribut_name);
        return indexB - indexA;
      });
    }
    return of(objFormDef);
  }

  initObjFormValues(obj, config, idsTypesSite = []) {
    return this._formService.formValues(obj, config).pipe(
      concatMap((genericFormValues) => {
        if (idsTypesSite.length != 0) {
          genericFormValues['types_site'] = idsTypesSite;
        }
        return of(genericFormValues);
      })
    );
  }

  initObjFormSpecificValues(obj, config) {
    return this._formService.formValues(obj, config);
  }

  getRemainingProperties(obj1: JsonData, obj2: JsonData): JsonData {
    const remainingObj: JsonData = {};
    for (let key in obj1) {
      if (!obj2.hasOwnProperty(key) || obj1[key] !== obj2[key]) {
        remainingObj[key] = obj1[key];
      }
    }
    for (let key in obj2) {
      if (!obj1.hasOwnProperty(key) || obj1[key] !== obj2[key]) {
        remainingObj[key] = obj2[key];
      }
    }

    return remainingObj;
  }

  mergeObjects(obj1: JsonData, obj2: JsonData): JsonData {
    const mergedObject: JsonData = { ...obj1 }; // Start with a copy of obj1

    // Loop through obj2 and overwrite or add keys to mergedObject
    for (const key in obj2) {
      if (obj2.hasOwnProperty(key)) {
        mergedObject[key] = obj2[key];
      }
    }

    return mergedObject;
  }

  addDynamicFormGroup(groupName: string) {
    const newFormGroup = this._formBuilder.group({});
    this.objFormsDynamic[groupName] = newFormGroup;
    return of(newFormGroup);
  }

  removeDynamicFormGroup(groupName: string): void {
    // Remove form group from objFormsDynamic
    delete this.objFormsDynamic[groupName];
    delete this.objFormsDefinitionDynamic[groupName];

    // Remove form group from the dynamicGroups FormArray
    const dynamicGroupsArray = this.objForm.get('dynamicGroups') as FormArray;
    const index = dynamicGroupsArray.controls.findIndex(
      (group) => group === this.objFormsDynamic[groupName]
    );
    if (index !== -1) {
      dynamicGroupsArray.removeAt(index);
    }
  }

  removeAllDynamicGroups(): void {
    // Clear objFormsDynamic and objFormsDefinitionDynamic
    this.objFormsDynamic = {};
    this.objFormsDefinitionDynamic = {};

    // Clear controls inside dynamicGroups FormArray
    const dynamicGroupsArray = this.objForm.get('dynamicGroups') as FormArray;
    while (dynamicGroupsArray.length) {
      dynamicGroupsArray.removeAt(0); // Remove controls from the beginning
    }
  }

  createFormWithDynamicGroups(objFormGroup): FormGroup {
    const dynamicGroups = this._formBuilder.array([]);
    objFormGroup.addControl('dynamicGroups', dynamicGroups);
    return objFormGroup;
  }

  addMultipleFormGroupsToObjForm(formGroups: { [key: string]: FormGroup }, targetForm: FormGroup) {
    let dynamicGroups = targetForm.get('dynamicGroups') as FormArray;

    if (!dynamicGroups) {
      dynamicGroups = this._formBuilder.array([]);
      targetForm.addControl('dynamicGroups', dynamicGroups);
      dynamicGroups = targetForm.get('dynamicGroups') as FormArray; // Refresh reference after adding it
    }

    for (let i = dynamicGroups.controls.length - 1; i >= 0; i--) {
      const control = dynamicGroups.controls[i];
      const controlName = control.get('name')?.value;
      if (!formGroups[controlName]) {
        dynamicGroups.removeAt(i);
      }
    }

    for (const key in formGroups) {
      const existingControlIndex = dynamicGroups.controls.findIndex(
        (control) => control.get('name')?.value === key
      );

      if (existingControlIndex !== -1) {
        dynamicGroups.controls[existingControlIndex].patchValue(formGroups[key].value, {
          emitEvent: false,
        });
      } else {
        const newControl = formGroups[key];
        newControl.addControl('name', this._formBuilder.control(key)); // Adding control with key as 'name'
        dynamicGroups.push(newControl);
      }
    }
    return targetForm;
  }

  // Method to patch values inside dynamic form groups
  patchValuesInDynamicGroups(valuesToPatch: { [key: string]: any }): void {
    Object.keys(this.objFormsDynamic).forEach((groupName) => {
      const formGroup = this.objFormsDynamic[groupName];
      if (formGroup instanceof FormGroup) {
        this.patchValuesInFormGroup(formGroup, valuesToPatch);
      }
    });
  }

  // Method to patch values inside a form group
  patchValuesInFormGroup(formGroup: FormGroup, valuesToPatch: { [key: string]: any }): void {
    Object.keys(valuesToPatch).forEach((controlName) => {
      if (formGroup.contains(controlName)) {
        formGroup.get(controlName).patchValue(valuesToPatch[controlName]);
      }
    });
  }

  flattenFormGroup(formGroup: FormGroup): { [key: string]: any } {
    const flatObject: { [key: string]: any } = {};

    // Recursive function to process nested controls
    const flattenControl = (control: AbstractControl, keyPrefix: string = ''): void => {
      if (control instanceof FormGroup) {
        Object.entries(control.controls).forEach(([controlName, nestedControl]) => {
          flattenControl(nestedControl, `${controlName}.`);
        });
      } else if (control instanceof FormArray) {
        control.controls.forEach((arrayControl, index) => {
          flattenControl(arrayControl, `${keyPrefix}`);
        });
      } else {
        flatObject[keyPrefix.slice(0, -1)] = control.value;
      }
    };

    // Start flattening from the root FormGroup
    flattenControl(formGroup);

    return flatObject;
  }

  filterObject(objToFilt: JsonData, arrayUseToFilt:  (string | number)[]): JsonData {
    const keysToFilter: (string | number)[] = arrayUseToFilt.map(String) as (string | number)[];
    const filteredObject = Object.keys(objToFilt).reduce((obj, key) => {
      if (keysToFilter.includes(key)) {
        obj[key] = objToFilt[key];
      }
      return obj;
    }, {});
    return filteredObject;
  }

  // TODO: VERIFIER si on garde cette "method" pour vérifier la validité des formGroup liés aux types de sites
  // Pour l'instant on choisi de ne garder que l'objForm qui contient le formArray dynamicGroup
  // qui lui même contient l'équivalent de l'ensemble des formGroup liés aux types de site
  areDynamicFormsValid(): boolean {
    // Iterate through each objFormDynamic and check if it's valid
    for (const typeSite in this.objFormsDynamic) {
      if (this.objFormsDynamic.hasOwnProperty(typeSite)) {
        const objFormDynamic = this.objFormsDynamic[typeSite];
        if (!objFormDynamic.valid) {
          return false; // If any objFormDynamic is invalid, return false
        }
      }
    }
    return true; // If all objFormsDynamic are valid, return true
  }

  ngOnDestroy() {
    this.objForm.patchValue({ geometry: null });
  }
}
