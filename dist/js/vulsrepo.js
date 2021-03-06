$(document).ready(function() {
    $.each(vulsrepo_template, function(index, val) {
        localStorage.setItem("vulsrepo_pivot_conf_user_" + val.key, val.value);
    });

    db.remove("vulsrepo_pivot_conf");
    db.remove("vulsrepo_pivot_conf_tmp");
    restoreParam();
    setEvents();
    createFolderTree();
    $('#drawerLeft').drawer('show');
});

const restoreParam = function() {
    if (location.search !== "") {
        try {
            let param = [...new URLSearchParams(location.search).entries()].reduce((obj, e) => ({...obj, [e[0]]: e[1]}), {});

            for (let [key, type] of Object.entries(vulsrepo_params)) {
                if (param[key] !== undefined) {
                    if (type === "boolean") {
                        if (["", "null", "true", "false"].includes(param[key])) {
                            if (param[key] === "false") {
                                db.set(key, param[key]);
                            } else {
                                db.remove(key);
                            }
                        } else {
                            showAlert("invalid parameter", param[key]);
                        }
                    } else if (type === "array") {
                        let decode_str = LZString.decompressFromEncodedURIComponent(param[key]);
                        if (decode_str === null) {
                            showAlert("param decode error", decode_str);
                        }
                        url_param = JSON.parse(decode_str);
                        let sorted_url_param = url_param.slice();
                        let sorted_detailTaget = vulsrepo.detailTaget.slice();
                        if (sorted_url_param.sort().toString() === sorted_detailTaget.sort().toString()) {
                            db.set(key, url_param);
                        } else {
                            showAlert("invalid parameter", param[key]);
                        }
                    } else if (type === "dictionary") {
                        let decode_str = LZString.decompressFromEncodedURIComponent(param[key]);
                        if (decode_str === null) {
                            showAlert("param decode error", decode_str);
                        }
                        url_param = JSON.parse(decode_str);
                        db.set(key, url_param);
                    }
                }
            }
            filterDisp.on("#label_pivot_conf");
        } catch (e) {
            showAlert("param parse error", e);
            return;
        }
    }
};

const initData = function() {
    $.blockUI(blockUIoption);
    getData().done(function(resultArray) {
        vulsrepo.detailRawData = resultArray;
        vulsrepo.detailPivotData = createPivotData(resultArray);
        initPivotTable();
    }).fail(function(result) {
        $.unblockUI(blockUIoption);
        if (result === "notSelect") {
            showAlert("Not Selected", "File is not selected.");
        } else {
            showAlert(result.status + " " + result.statusText, result.responseText);
        }
    });
};

const initPivotTable = function() {
    $.blockUI(blockUIoption);
    setTimeout(function() {
        displayPivot(vulsrepo.detailPivotData);
        setPulldown("#drop_topmenu", true);
        setPulldownDisplayChangeEvent("#drop_topmenu");
        $.unblockUI(blockUIoption);
    }, 500);
};

let packageTable = $("#table-package").DataTable();
const clipboard = new Clipboard('.btn');

const db = {
    set: function(key, obj) {
        localStorage.setItem(key, JSON.stringify(obj));
    },
    get: function(key) {
        return JSON.parse(localStorage.getItem(key));
    },
    remove: function(key) {
        localStorage.removeItem(key);
    },
    setPivotConf: function(key, obj) {
        localStorage.setItem("vulsrepo_pivot_conf_user_" + key, JSON.stringify(obj));
    },
    getPivotConf: function(key) {
        return JSON.parse(localStorage.getItem("vulsrepo_pivot_conf_user_" + key));
    },
    removePivotConf: function(key) {
        localStorage.removeItem("vulsrepo_pivot_conf_user_" + key);
    },
    listPivotConf: function(key) {
        var array = [];
        for (var i = 0; i < localStorage.length; i++) {
            if (localStorage.key(i).indexOf('vulsrepo_pivot_conf_user_') != -1) {
                array.push(localStorage.key(i).replace(/vulsrepo_pivot_conf_user_/g, ''));
            }
        }
        array.sort();
        return array;
    }
};

const filterDisp = {
    on: function(labelName) {
        $(labelName).removeClass("label-info").addClass("label-warning").text("Filter ON");
    },

    off: function(labelName) {
        $(labelName).removeClass("label-warning").addClass("label-info").text("Filter OFF");
    }
};

const fadeAlert = function(target) {
    $(target).fadeIn(1000).delay(2000).fadeOut(1000);
};

const showAlert = function(code, text) {
    $("#alert_error_code").empty();
    $("#alert_responce_text").empty();
    $("#alert_error_code").append("<div>" + code + "</div>");
    $("#alert_responce_text").append("<div>" + text + "</div>");
    $("#modal-alert").modal('show');
};

const blockUIoption = {
    message: '<h4><img src="./dist/img/loading.gif" />　Please Wait...</h4>',
    fadeIn: 200,
    fadeOut: 200,
    css: {
        border: 'none',
        padding: '15px',
        backgroundColor: '#000',
        '-webkit-border-radius': '10px',
        '-moz-border-radius': '10px',
        opacity: .5,
        color: '#fff'
    }
};

const getData = function() {

    $.ajaxSetup({
        timeout: vulsrepo.timeOut
    });

    var kickCount = 0;
    var endCount = 0;
    var resultArray = [];
    var defer = new $.Deferred();

    var selectedFiles = getSelectedFile();

    if (selectedFiles.length === 0) {
        defer.reject("notSelect");
        return defer.promise();
    }

    $.each(selectedFiles, function(key, value) {
        var url = value.url;
        $.getJSON(url).done(function(json_data) {
            endCount++;
            var resultMap = {
                scanTime: value.parent_title,
                data: json_data
            };

            if (resultMap.data.jsonVersion === undefined) {
                showAlert("Old JSON format", value.url);
                $.unblockUI(blockUIoption);
                return;
            }

            if (resultMap.data.reportedAt === "0001-01-01T00:00:00Z") {
                showAlert("Vuls report is not running ", value.url);
                $.unblockUI(blockUIoption);
                return;
            }

            resultArray.push(resultMap);
            if (kickCount == endCount) {
                defer.resolve(resultArray);
            }
        }).fail(function(jqXHR, textStatus, errorThrown) {
            defer.reject(jqXHR);
        });
        kickCount++;
    });
    return defer.promise();
};

const getSelectedFile = function() {
    var selectedFile = $.map($("#folderTree").dynatree("getSelectedNodes"), function(node) {
        if (node.data.isFolder === false) {
            var data = {
                title: node.data.title,
                url: "results" + node.data.url,
                parent_title: node.parent.data.title
            };
            return (data);
        }
    });
    return selectedFile;
};

const setPulldown = function(target, withDefault) {
    $(target).empty();
    $.each(db.listPivotConf(), function(index, val) {
        let matchDefault = false;
        if (withDefault === false) {
            matchDefault = isDefaultFilter(val);
        }
        if (matchDefault === false) {
            $(target).append('<li><a href="javascript:void(0)" value=\"' + val + '\">' + val + '</a></li>');
        }
    });

    $(target + ' a').off('click');
    $(target + ' a').on('click', function() {
        $(target + "_visibleValue").html($(this).attr('value'));
        $(target + "_hiddenValue").val($(this).attr('value'));
    });

};

const setPulldownDisplayChangeEvent = function(target) {
    $(target + ' a').on('click', function() {
        var val = $(this).attr('value');
        var conf = db.getPivotConf(val);
        db.set("vulsrepo_pivot_conf", conf);
        db.remove("vulsrepo_pivot_conf_tmp");
        initPivotTable();
        filterDisp.on("#label_pivot_conf");
        let matchDefault = isDefaultFilter(val);
        $("#delete_pivot_conf").prop("disabled", matchDefault);
    });
};

const isDefaultFilter = function(val) {
    let result = false;
    $.each(vulsrepo_template, function(index, temp) {
        if (val === temp.key) {
            result = true;
            return;
        }
    });
    return result;
};

const setEvents = function() {

    // ---file select
    $(".submitSelectfile").click(function() {
        $('#drawerLeft').drawer('hide');
        setTimeout(initData, 500);
    });

    $("#btnSelectAll").click(function() {
        $("#folderTree").dynatree("getRoot").visit(function(node) {
            node.select(true);
        });
        return false;
    });

    $("#btnDeselectAll").click(function() {
        $("#folderTree").dynatree("getRoot").visit(function(node) {
            node.select(false);
        });
        return false;
    });

    // ---pivot setting
    $("#save_pivot_conf").click(function() {
        $("#alert_saveDiag_textbox").css("display", "none");
        $("#alert_saveDiag_dropdown").css("display", "none");
        $("#input_saveDiag").val("");
        $("#drop_saveDiag_visibleValue").html("Select filter");
        $("#drop_saveDiag_hiddenValue").val("");

        setPulldown("#drop_saveDiag", false);
        $("#modal-saveDiag").modal('show');
    });

    $('input[name=radio_setting]:eq(0)').click(function() {
        $("#input_saveDiag").prop("disabled", false);
        $('#drop_saveDiag_buttonGroup button').prop("disabled", true);
    });

    $('input[name=radio_setting]:eq(1)').click(function() {
        $("#input_saveDiag").prop("disabled", true);
        $('#drop_saveDiag_buttonGroup button').prop("disabled", false);
    });

    $("#ok_saveDiag").click(function() {
        var configName;
        if ($('input[name=radio_setting]:eq(0)').prop('checked')) {
            configName = $("#input_saveDiag").val();
            if (configName !== "") {
                let matchDefault = isDefaultFilter(configName);
                if (matchDefault === true) {
                    $("#alert_saveDiag_textbox").text("'" + configName + "' is reserved filter name.");
                    $("#alert_saveDiag_textbox").css("display", "");
                    return;
                } else {
                    db.setPivotConf(configName, db.get("vulsrepo_pivot_conf_tmp"));
                    db.set("vulsrepo_pivot_conf", db.get("vulsrepo_pivot_conf_tmp"));
                    db.remove("vulsrepo_pivot_conf_tmp");
                }
            } else {
                $("#alert_saveDiag_textbox").text("Filter name cannot be empty.");
                $("#alert_saveDiag_textbox").css("display", "");
                return;
            }
        } else {
            configName = $("#drop_saveDiag_hiddenValue").attr('value');

            if (configName !== "") {
                db.setPivotConf(configName, db.get("vulsrepo_pivot_conf_tmp"));
                db.set("vulsrepo_pivot_conf", db.get("vulsrepo_pivot_conf_tmp"));
                db.remove("vulsrepo_pivot_conf_tmp");
            } else {
                $("#alert_saveDiag_dropdown").css("display", "");
                return;
            }

        }

        setPulldown("#drop_topmenu", true);
        setPulldownDisplayChangeEvent("#drop_topmenu");
        $("#drop_topmenu_visibleValue").html(configName);
        $("#drop_topnemu_hiddenValue").val(configName);
        $("#delete_pivot_conf").prop("disabled", false);

        $("#modal-saveDiag").modal('hide');
        filterDisp.on("#label_pivot_conf");
        fadeAlert("#alert_pivot_conf");

    });

    $("#cancel_saveDiag").click(function() {
        $("#modal-saveDiag").modal('hide');
    });

    $("#delete_pivot_conf").click(function() {
        let ret = confirm("Are you sure to delete?");
        if (ret === true) {
            db.removePivotConf($("#drop_topmenu_hiddenValue").attr('value'));
            db.remove("vulsrepo_pivot_conf");
            db.remove("vulsrepo_pivot_conf_tmp");
            $("#drop_topmenu_visibleValue").html("Select filter");
            $("#drop_topnemu_hiddenValue").val("");
            fadeAlert("#alert_pivot_conf");
            initPivotTable();
        }
    });

    $("#clear_pivot_conf").click(function() {
        db.remove("vulsrepo_pivot_conf");
        db.remove("vulsrepo_pivot_conf_tmp");
        $("#drop_topmenu_visibleValue").html("Select filter");
        $("#drop_topnemu_hiddenValue").val("");
        fadeAlert("#alert_pivot_conf");
        initPivotTable();
    });

    // ---detail cveid
    $('a[href="#package-r"]').click(function() {
        setTimeout(function() { packageTable.columns.adjust(); }, 1);
    });

    // displayHelpMes();
    displayHelpMesScore();

    // ---all setting
    $("#Setting").click(function() {
        $("#modal-setting").modal('show');
    });

    $("#modal-setting").on("hidden.bs.modal", function() {
        initData();
    });

    // ---switch
    let initSwitch = function(name) {
        $("[name='" + name + "']").bootstrapSwitch();
        if (db.get("vulsrepo_" + name) === "false") {
            $('input[name="' + name + '"]').bootstrapSwitch('state', false, false);
        }

        $('input[name="' + name + '"]').on('switchChange.bootstrapSwitch', function(event, state) {
            if (state === false) {
                db.set("vulsrepo_" + name, "false");
            } else {
                db.remove("vulsrepo_" + name);
            }
        });
    };
    initSwitch("chkPivotSummary");
    initSwitch("chkPivotCvss");
    initSwitch("chkCweTop25");
    initSwitch("chkOwaspTopTen2017");
    initSwitch("chkSansTop25");

    // ---priority

    var priority = db.get("vulsrepo_pivotPriority");
    if (priority === null) {
        db.set("vulsrepo_pivotPriority", vulsrepo.detailTaget);
    }

    if (Array.isArray(priority) === false) {
        db.set("vulsrepo_pivotPriority", vulsrepo.detailTaget);
    }

    if (priority != null && priority.length !== 9) {
        db.set("vulsrepo_pivotPriority", vulsrepo.detailTaget);
    }

    $.each(db.get("vulsrepo_pivotPriority"), function(i, i_val) {
        $("#pivot-priority").append('<li class="ui-state-default"><span class="fa fa-arrows-v" aria-hidden="true"></span>' + i_val + '</li>');
    });
    $('#pivot-priority').sortable({
        tolerance: "pointer",
        distance: 1,
        cursor: "move",
        revert: 100,
        placeholder: "placeholder",
        update: function() {
            let tmp_pri = [];
            $("#pivot-priority li").each(function(index) {
                tmp_pri.push($(this).text());
            });
            db.set("vulsrepo_pivotPriority", tmp_pri);
        }
    });
    $('#pivot-priority').disableSelection();

    $("#pivot-link").click(function() {
        let str = location.href + "?vulsrepo_pivot_conf_tmp=" + LZString.compressToEncodedURIComponent(localStorage.getItem("vulsrepo_pivot_conf_tmp"));
        str = str + "&vulsrepo_chkPivotSummary=" + db.get("vulsrepo_chkPivotSummary");
        str = str + "&vulsrepo_chkPivotCvss=" + db.get("vulsrepo_chkPivotCvss");
        str = str + "&vulsrepo_pivotPriority=" + LZString.compressToEncodedURIComponent(localStorage.getItem("vulsrepo_pivotPriority"));
        str = str + "&vulsrepo_chkCweTop25=" + db.get("vulsrepo_chkCweTop25");
        str = str + "&vulsrepo_chkOwaspTopTen2017=" + db.get("vulsrepo_chkOwaspTopTen2017");
        str = str + "&vulsrepo_chkSansTop25=" + db.get("vulsrepo_chkSansTop25");
        $("#view_url_box").val("");
        $("#view_url_box").val(str);
        $("#modal-viewUrl").modal('show');
    });

};

const createFolderTree = function() {

    var target;
    if (vulsrepo.demoFlag === true) {
        target = "getfilelist.json"
    } else {
        target = "getfilelist/"
    }

    var tree = $("#folderTree").dynatree({
        initAjax: {
            url: target
        },
        ajaxDefaults: {
            cache: false,
            timeout: 120000,
            dataType: "json"
        },
        minExpandLevel: 1,
        persist: false,
        clickFolderMode: 2,
        checkbox: true,
        selectMode: 3,
        fx: {
            height: "toggle",
            duration: 200
        },
        noLink: false,
        debugLevel: 0
    });
};

const isCheckNull = function(o) {
    if (o === undefined) {
        return true;
    } else if (o === null) {
        return true;
    } else if (o.length === 0) {
        return true;
    }
    return false;
}

const createPivotData = function(resultArray) {
    let array = [];
    let cveid_count = 0;
    const prioltyFlag = db.get("vulsrepo_pivotPriority");
    const summaryFlag = db.get("vulsrepo_chkPivotSummary");
    const cvssFlag = db.get("vulsrepo_chkPivotCvss");
    const cweTop25Flag = db.get("vulsrepo_chkCweTop25");
    const owaspTopTen2017Flag = db.get("vulsrepo_chkOwaspTopTen2017");
    const sansTop25Flag = db.get("vulsrepo_chkSansTop25");

    $.each(resultArray, function(x, x_val) {
        if (Object.keys(x_val.data.scannedCves).length === 0) {

            let result = {
                "ScanTime": x_val.scanTime,
                "Family": x_val.data.family,
                "Release": x_val.data.release,
                "CveID": "healthy",
                "Packages": "healthy",
                "FixedIn": "healthy",
                "FixState": "healthy",
                "NotFixedYet": "healthy",
                "PackageVer": "healthy",
                "NewPackageVer": "healthy",
                "Repository": "healthy",
                "CweID": "healthy",
                "Summary": "healthy",
                "CVSS Score": "healthy",
                "CVSS Severity": "healthy",
                "CVSSv3 (AV)": "healthy",
                "CVSSv3 (AC)": "healthy",
                "CVSSv3 (PR)": "healthy",
                "CVSSv3 (UI)": "healthy",
                "CVSSv3 (S)": "healthy",
                "CVSSv3 (C)": "healthy",
                "CVSSv3 (I)": "healthy",
                "CVSSv3 (A)": "healthy",
                "CVSS (AV)": "healthy",
                "CVSS (AC)": "healthy",
                "CVSS (Au)": "healthy",
                "CVSS (C)": "healthy",
                "CVSS (I)": "healthy",
                "CVSS (A)": "healthy",
                "AdvisoryID": "healthy",
                "CERT": "healthy",
                "PoC": "healthy",
                "Mitigation": "healthy",
                "Changelog": "healthy",
                "DetectionMethod": "healthy",
                "ConfidenceScore": "healthy",
                "Published": "healthy",
                "Last Modified": "healthy",
            };

            result["ServerName"] = getServerName(x_val.data);

            if (x_val.data.platform.name !== "") {
                result["Platform"] = x_val.data.platform.name;
            } else {
                result["Platform"] = "None";
            }

            if (x_val.data.container.name !== "") {
                result["Container"] = x_val.data.container.name;
            } else {
                result["Container"] = "None";
            }
            array.push(result);
        } else {
            $.each(x_val.data.scannedCves, function(y, y_val) {
                let targetNames;
                if (isCheckNull(y_val.cpeNames) === false) {
                    targetNames = y_val.cpeNames;
                } else if(isCheckNull(y_val.cpeURIs) === false) {
                    targetNames = y_val.cpeURIs;
                } else {
                    targetNames = y_val.affectedPackages;
                }

                cveid_count = cveid_count + 1
                $.each(targetNames, function(p, p_val) {
                    if (p_val.name === undefined) {
                        pkgName = p_val;
                        NotFixedYet = "Unknown";
                        fixedIn = "";
                        fixState = "";
                    } else {
                        pkgName = p_val.name;
                        NotFixedYet = isNotFixedYet(p_val);
                        fixedIn = getFixedIn(p_val);
                        fixState = getFixState(p_val);
                    }

                    let pkgInfo = x_val.data.packages[pkgName];

                    let result = {
                        "ScanTime": x_val.scanTime,
                        "Family": x_val.data.family,
                        "Release": x_val.data.release,
                        "CveID": "CHK-cveid-" + y_val.cveID,
                        "Packages": pkgName,
                        "NotFixedYet": NotFixedYet,
                        "FixedIn": fixedIn,
                        "FixState": fixState
                    };

                    result["ServerName"] = getServerName(x_val.data);

                    var getCweId = function(target) {
                        if (y_val.cveContents === undefined || y_val.cveContents[target] === undefined) {
                            return false;
                        }

                        let cweIds = y_val.cveContents[target].cweIDs;
                        let cweIdStr = "";
                        if (cweIds !== undefined) {
                            // NVD-CWE-Other and NVD-CWE-noinfo
                            if(cweIds[0].indexOf("NVD-CWE-") !== -1) {
                                result["CweID"] = cweIds[0];
                            } else {
                                for(var j = 0; j < cweIds.length; j++) {
                                    cweIdStr = cweIdStr + cweIds[j];
                                    let match = false;
                                    let makeCweStr = function(source) {
                                        if (match === true) {
                                            return;
                                        }
                                        for(var i = 0; i < cweTop[source].length; i++) {
                                            if(cweIds[j] === "CWE-" + cweTop[source][i]) {
                                                match = true;
                                                break;
                                            }
                                        }
                                        if (match === true) {
                                            cweIdStr = cweIdStr + "[!!]";
                                        }
                                    };
                                    if (cweTop25Flag !== "false") {
                                        makeCweStr("cweTop25");
                                    }
                                    if (owaspTopTen2017Flag !== "false") {
                                        makeCweStr("owaspTopTen2017");
                                    }
                                    if (sansTop25Flag !== "false") {
                                        makeCweStr("sansTop25");
                                    }
                                    if (j < cweIds.length - 1) {
                                        cweIdStr = cweIdStr + ", ";
                                    }
                                }
                                result["CweID"] = "CHK-cweid-" + cweIdStr;
                            }
                        }
                        return true;
                    };

                    var cweFlag = false;
                    result["CweID"] = "None";
                    $.each(prioltyFlag, function(i, i_val) {
                        if (cweFlag !== true) {
                            cweFlag = getCweId(i_val);
                        }
                    });

                    if (x_val.data.platform.name !== "") {
                        result["Platform"] = x_val.data.platform.name;
                    } else {
                        result["Platform"] = "None";
                    }

                    if (x_val.data.container.name !== "") {
                        result["Container"] = x_val.data.container.name;
                    } else {
                        result["Container"] = "None";
                    }

                    var cert = "";
                    if (y_val.alertDict.en != null) {
                        cert = y_val.alertDict.en[0].url;
                    }
                    if (y_val.alertDict.ja != null) {
                        if (cert !== "") {
                            cert = cert + ",";
                        }
                        cert = cert + y_val.alertDict.ja[0].url;
                    }
                    if (cert !== "") {
                        cert = "CHK-CERT-" + cert;
                    }
                    result["CERT"] = cert;

                    if (y_val.exploits !== undefined || y_val.metasploits !== undefined) {
                        let count = 0;
                        if (y_val.exploits !== undefined) {
                            count = y_val.exploits.length;
                        }
                        if (y_val.metasploits !== undefined) {
                            $.each(y_val.metasploits, function(x, m_val) {
                                count = count + m_val.URLs.length;
                            });
                        }
                        result["PoC"] = "PoC(" + count + ")";
                    } else {
                        result["PoC"] = "";
                    }

                    if (y_val.distroAdvisories !== undefined) {
                        result["AdvisoryID"] = "CHK-advisoryid-" + y_val.distroAdvisories[0].advisoryID;
                    } else {
                        result["AdvisoryID"] = "None";
                    }

                    DetectionMethod = y_val.confidences[0].detectionMethod;
                    result["DetectionMethod"] = DetectionMethod;
                    result["ConfidenceScore"] = y_val.confidences[0].score;
                    if (pkgInfo !== undefined) {
                        if (pkgInfo.changelog !== undefined && pkgInfo.changelog.contents !== "") {
                            result["Changelog"] = "CHK-changelog-" + y_val.cveID + "," + x_val.scanTime + "," + x_val.data.serverName + "," + x_val.data.container.name + "," + pkgName;
                        } else {
                            result["Changelog"] = "None";
                        }

                        if (pkgInfo.Version !== "") {
                            if (pkgInfo.release !== "") {
                                result["PackageVer"] = pkgInfo.version + "-" + pkgInfo.release;
                            } else {
                                result["PackageVer"] = pkgInfo.version;
                            }
                        } else {
                            result["PackageVer"] = "None";
                        }

                        if (pkgInfo.NewVersion !== "") {
                            if (pkgInfo.newRelease !== "") {
                                result["NewPackageVer"] = pkgInfo.newVersion + "-" + pkgInfo.newRelease;
                            } else {
                                result["NewPackageVer"] = pkgInfo.newVersion;
                            }
                        } else {
                            result["NewPackageVer"] = "None";
                        }
                        result["Repository"] = pkgInfo.repository;
                    } else {
                        // ===for cpe
                        result["PackageVer"] = "Unknown";
                        result["NewPackageVer"] = "Unknown";
                        result["Changelog"] = "None";
                        result["Repository"] = ""
                    }

                    var getSummaryAndDate = function(target) {
                        if (y_val.cveContents === undefined || y_val.cveContents[target] === undefined) {
                            return false;
                        }

                        if (summaryFlag !== "false") {
                            result["Summary"] = y_val.cveContents[target].summary;
                        }

                        // yyyy-mm-dd
                        let getDateStr = function(datetime) {
                            var str = "";
                            if (datetime !== "0001-01-01T00:00:00Z") {
                                var d = new Date(datetime);
                                const year = d.getFullYear();
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const day = String(d.getDate()).padStart(2, '0');

                                str = `${year}-${month}-${day}`
                                if (Date.now() - d.getTime() < 86400000 * 15) {
                                    // Last 15 days
                                    str += " [New!]";
                                }
                            } else {
                                str = "------";
                            }

                            return str;
                        };
                        result["Published"] = getDateStr(y_val.cveContents[target].published);
                        result["Last Modified"] = getDateStr(y_val.cveContents[target].lastModified);

                        return true;
                    };

                    var sumFlag = false;
                    $.each(prioltyFlag, function(i, i_val) {
                        if (sumFlag !== true) {
                            sumFlag = getSummaryAndDate(i_val);
                        }
                    });

                    if (sumFlag === false) {
                        result["Summary"] = "Unknown";
                        result["Published"] = "Unknown";
                        result["Last Modified"] = "Unknown";
                    }

                    var getMitigation = function(target) {
                        if (y_val.cveContents[target] === undefined || y_val.cveContents[target].mitigation === undefined || y_val.cveContents[target].mitigation === "") {
                            return false;
                        }

                        result["Mitigation"] = "Yes";
                        return true;
                    };

                    var mitigationFlag = false;
                    $.each(prioltyFlag, function(i, i_val) {
                        if (mitigationFlag !== true) {
                            mitigationFlag = getMitigation(i_val);
                        }
                    });

                    if (mitigationFlag === false) {
                        result["Mitigation"] = "";
                    }

                    let getCvss = function(target) {
                        if (y_val.cveContents === undefined || y_val.cveContents[target] === undefined) {
                            return false;
                        }

                        if (y_val.cveContents[target].cvss2Score === 0 & y_val.cveContents[target].cvss3Score === 0) {
                            return false;
                        }

                        if (y_val.cveContents[target].cvss3Score !== 0) {
                            result["CVSS Score"] = y_val.cveContents[target].cvss3Score.toFixed(1);
                            result["CVSS Severity"] = toUpperFirstLetter(y_val.cveContents[target].cvss3Severity);
                            result["CVSS Score Type"] = target + "V3";
                        } else if (y_val.cveContents[target].cvss2Score !== 0) {
                            result["CVSS Score"] = y_val.cveContents[target].cvss2Score.toFixed(1);
                            result["CVSS Severity"] = toUpperFirstLetter(y_val.cveContents[target].cvss2Severity);
                            result["CVSS Score Type"] = target;
                        }

                        if (cvssFlag !== "false") {
                            if (y_val.cveContents[target].cvss3Vector !== "") { //ex) CVE-2016-5483
                                var arrayVector = getSplitArray(y_val.cveContents[target].cvss3Vector);
                                let cvssv3 = getVectorV3.cvss(arrayVector[1], "");
                                result["CVSSv3 (AV)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[2], "");
                                result["CVSSv3 (AC)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[3], arrayVector[5]);
                                result["CVSSv3 (PR)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[4], "");
                                result["CVSSv3 (UI)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[5], "");
                                result["CVSSv3 (S)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[6], "");
                                result["CVSSv3 (C)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[7], "");
                                result["CVSSv3 (I)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                                cvssv3 = getVectorV3.cvss(arrayVector[8], "");
                                result["CVSSv3 (A)"] = cvssv3[0] + "(" + cvssv3[1] + ")";
                            } else {
                                result["CVSSv3 (AV)"] = "Unknown";
                                result["CVSSv3 (AC)"] = "Unknown";
                                result["CVSSv3 (PR)"] = "Unknown";
                                result["CVSSv3 (UI)"] = "Unknown";
                                result["CVSSv3 (S)"] = "Unknown";
                                result["CVSSv3 (C)"] = "Unknown";
                                result["CVSSv3 (I)"] = "Unknown";
                                result["CVSSv3 (A)"] = "Unknown";
                            }
                            if (y_val.cveContents[target].cvss2Vector !== "") { //ex) CVE-2016-5483
                                var arrayVector = getSplitArray(y_val.cveContents[target].cvss2Vector);
                                let cvssv2 = getVectorV2.cvss(arrayVector[0]);
                                result["CVSS (AV)"] = cvssv2[0] + "(" + cvssv2[1] + ")";
                                cvssv2 = getVectorV2.cvss(arrayVector[1]);
                                result["CVSS (AC)"] = cvssv2[0] + "(" + cvssv2[1] + ")";
                                cvssv2 = getVectorV2.cvss(arrayVector[2]);
                                result["CVSS (Au)"] = cvssv2[0] + "(" + cvssv2[1] + ")";
                                cvssv2 = getVectorV2.cvss(arrayVector[3]);
                                result["CVSS (C)"] = cvssv2[0] + "(" + cvssv2[1] + ")";
                                cvssv2 = getVectorV2.cvss(arrayVector[4]);
                                result["CVSS (I)"] = cvssv2[0] + "(" + cvssv2[1] + ")";
                                cvssv2 = getVectorV2.cvss(arrayVector[5]);
                                result["CVSS (A)"] = cvssv2[0] + "(" + cvssv2[1] + ")";
                            } else {
                                result["CVSS (AV)"] = "Unknown";
                                result["CVSS (AC)"] = "Unknown";
                                result["CVSS (Au)"] = "Unknown";
                                result["CVSS (C)"] = "Unknown";
                                result["CVSS (I)"] = "Unknown";
                                result["CVSS (A)"] = "Unknown";
                            }
                        }

                        return true;
                    };

                    let flag = false;
                    $.each(prioltyFlag, function(i, i_val) {
                        if (flag !== true) {
                            flag = getCvss(i_val);
                        }
                    });

                    if (flag === false) {
                        result["CVSS Score"] = "Unknown";
                        result["CVSS Severity"] = "Unknown";
                        result["CVSS Score Type"] = "Unknown";
                        result["CVSSv3 (AV)"] = "Unknown";
                        result["CVSSv3 (AC)"] = "Unknown";
                        result["CVSSv3 (PR)"] = "Unknown";
                        result["CVSSv3 (UI)"] = "Unknown";
                        result["CVSSv3 (S)"] = "Unknown";
                        result["CVSSv3 (C)"] = "Unknown";
                        result["CVSSv3 (I)"] = "Unknown";
                        result["CVSSv3 (A)"] = "Unknown";
                        result["CVSS (AV)"] = "Unknown";
                        result["CVSS (AC)"] = "Unknown";
                        result["CVSS (Au)"] = "Unknown";
                        result["CVSS (C)"] = "Unknown";
                        result["CVSS (I)"] = "Unknown";
                        result["CVSS (A)"] = "Unknown";
                    }

                    array.push(result);
                });
            });
        }
    });

    console.info("CveidCount: " + cveid_count);
    console.info("PivotDataCount: " + array.length);
    return array;
};

const isNotFixedYet = function(val) {
    var result = "Fixed";
    if (val.notFixedYet !== undefined) {
        result = val.notFixedYet === true ? "Unfixed" : "Fixed";
    }
    return result;
};

const getFixedIn = function(val) {
    var result = "";
    if (val.fixedIn !== undefined) {
        result = val.fixedIn;
    }
    return result;
};

const getFixState = function(val) {
    var result = "";
    if (val.fixState !== undefined) {
        result = val.fixState;
    }
    return result;
};

const getServerName = function(data) {
    let servername = data.serverName;
    if (data.warnings.length > 0) {
        servername = "[Warn] " + servername;
    }
    if (data.runningKernel.rebootRequired === true) {
        servername = "[Reboot Required] " + servername;
    }
    return servername;
};

const displayPivot = function(array) {

    var url = window.location.href
    var new_url = url.replace(/\?.*$/, "");
    history.replaceState(null, null, new_url);

    var derivers = $.pivotUtilities.derivers;
    var renderers = $.extend($.pivotUtilities.renderers, $.pivotUtilities.c3_renderers);
    var dateFormat = $.pivotUtilities.derivers.dateFormat;
    var sortAs = $.pivotUtilities.sortAs;
    var naturalSort = $.pivotUtilities.naturalSort;

    var pivot_attr = {
        renderers: renderers,
        menuLimit: 3000,
        rows: ["ScanTime", "ServerName", "Container"],
        cols: ["CVSS Severity", "CVSS Score"],
        vals: [""],
        exclusions: "",
        aggregatorName: "Count",
        rendererName: "Heatmap",
        rendererOptions: {
            c3: {
                data: {
                    colors: {
                        Unknown: "#666666",
                        Critical: "#cb4829",
                        High: "#d59533",
                        Important: "#d59533",
                        Medium: "#dfd238",
                        Moderate: "#dfd238",
                        Low: "#93b447"
                    }
                }
            },
            heatmap: {
                colorScaleGenerator: function(values) {
                    return d3.scale.sqrt()
                        .domain([0, array.length])
                        .range(["#ffffff", "#fa8072"])
                }
            }
        },
        sorters: {
            "CVSS Severity": sortAs(["healthy", "Unknown", "Critical", "High", "Important", "Medium", "Moderate", "Low"]),
            "CveID": sortAs(["healthy"]),
            "CweID": sortAs(["healthy"]),
            "Packages": sortAs(["healthy"]),
            "CVSS Score": function (a, b) { return -naturalSort(a, b); }, // sort backwards
            "Summary": sortAs(["healthy"]),
            "CVSSv3 (AV)": sortAs(["healthy", "NETWORK(0.85)", "ADJACENT_NETWORK(0.62)", "LOCAL(0.55)", "PHYSICAL(0.2)", "Unknown"]),
            "CVSSv3 (AC)": sortAs(["healthy", "LOW(0.77)", "HIGH(0.44)", "Unknown"]),
            "CVSSv3 (PR)": sortAs(["healthy", "NONE(0.85)", "LOW(0.68)", "LOW(0.62)", "HIGH(0.5)", "HIGH(0.27)", "Unknown"]),
            "CVSSv3 (UI)": sortAs(["healthy", "NONE(0.85)", "REQUIRED(0.62)", "Unknown"]),
            "CVSSv3 (S)": sortAs(["healthy", "CHANGED(0)", "UNCHANGED(0)", "Unknown"]),
            "CVSSv3 (C)": sortAs(["healthy", "HIGH(0.56)", "LOW(0.22)", "NONE(0)", "Unknown"]),
            "CVSSv3 (I)": sortAs(["healthy", "HIGH(0.56)", "LOW(0.22)", "NONE(0)", "Unknown"]),
            "CVSSv3 (A)": sortAs(["healthy", "HIGH(0.56)", "LOW(0.22)", "NONE(0)", "Unknown"]),
            "CVSS (AV)": sortAs(["healthy", "NETWORK(1)", "ADJACENT_NETWORK(0.646)", "LOCAL(0.395)", "Unknown"]),
            "CVSS (AC)": sortAs(["healthy", "LOW(0.71)", "MEDIUM(0.61)", "HIGH(0.35)", "Unknown"]),
            "CVSS (Au)": sortAs(["healthy", "NONE(0.704)", "SINGLE_INSTANCE(0.56)", "MULTIPLE_INSTANCES(0.45)", "Unknown"]),
            "CVSS (C)": sortAs(["healthy", "COMPLETE(0.66)", "PARTIAL(0.275)", "NONE(0)", "Unknown"]),
            "CVSS (I)": sortAs(["healthy", "COMPLETE(0.66)", "PARTIAL(0.275)", "NONE(0)", "Unknown"]),
            "CVSS(I)": sortAs(["healthy", "COMPLETE(0.66)", "PARTIAL(0.275)", "NONE(0)", "Unknown"]),
            "CERT": function (a, b) { return -naturalSort(a, b); }, // sort backwards
            "PoC": function (a, b) { return -naturalSort(a, b); }, // sort backwards
            "Published": function (a, b) { return -naturalSort(a, b); }, // sort backwards
            "Last Modified": function (a, b) { return -naturalSort(a, b); } // sort backwards
        },
        onRefresh: function(config) {
            db.set("vulsrepo_pivot_conf_tmp", config);
            $("#pivot_base").find(".pvtVal[data-value='null']").css("background-color", "#b2f3b2");

            let cvsss = ["Critical", "High", "Medium", "Low", "Important", "Moderate"];
            $.each(cvsss, function(i, i_val) {
                $("#pivot_base").find("th:contains('" + i_val + "')").each(function() {
                    if ($(this).text() === i_val) {
                        $(this).addClass("cvss-" + i_val);
                    }
                });
            });

            $("#pivot_base").find("th:contains('Unfixed')").each(function() {
                if ($(this).text() === "Unfixed") {
                    $(this).addClass("notfixyet-true");
                }
            });

            $("#pivot_base").find("th:contains('Fixed')").each(function() {
                if ($(this).text() === "Fixed") {
                    $(this).addClass("notfixyet-false");
                }
            });

            $("#pivot_base").find("th:contains('healthy')").css("background-color", "lightskyblue");
            $("#pivot_base").find("th:contains('CveID')").css("minWidth", "110px");
            $("#pivot_base").find("th:contains('Reboot Required')").css("color", "#da0b00");
            addAdvisoryIDLink();
            addCertLink();
            addCveIDLink();
            addCweIDLink();
            addChangelogLink();
        }

    };

    var pivot_obj;
    pivot_obj = db.get("vulsrepo_pivot_conf_tmp");
    if (pivot_obj === null) {
        pivot_obj = db.get("vulsrepo_pivot_conf");
    }

    if (pivot_obj != null) {
        pivot_attr["rows"] = pivot_obj["rows"];
        pivot_attr["cols"] = pivot_obj["cols"];
        pivot_attr["vals"] = pivot_obj["vals"];
        pivot_attr["exclusions"] = pivot_obj["exclusions"];
        pivot_attr["aggregatorName"] = pivot_obj["aggregatorName"];
        pivot_attr["rendererName"] = pivot_obj["rendererName"];
        pivot_attr["rowOrder"] = pivot_obj["rowOrder"];
        pivot_attr["colOrder"] = pivot_obj["colOrder"];
    } else {
        filterDisp.off("#label_pivot_conf");
    }

    $("#pivot_base").pivotUI(array, pivot_attr, {
        overwrite: "true"
    });

};

const addCveIDLink = function() {
    let doms = $("#pivot_base").find("th:contains('CHK-cveid-')");
    doms.each(function() {
        let cveid = $(this).text().replace("CHK-cveid-", "");
        $(this).text("").append('<a class="cveid">' + cveid + '</a>');
    });

    $('.cveid').on('click', function() {
        displayDetail(this.text);
    });
};

const addCweIDLink = function() {
    const prioltyFlag = db.get("vulsrepo_pivotPriority");
    let nvd = prioltyFlag.indexOf("nvd");
    let jvn = prioltyFlag.indexOf("jvn");

    let doms = $("#pivot_base").find("th:contains('CHK-cweid-')");
    doms.each(function() {
        let cveid = $(this).text();
        cveid = cveid.replace("CHK-cweid-", "");
        let cveids = cveid.split(', ');
        let generated = "";
        for (var i = 0; i < cveids.length; i++) {
            if (cveids[i].indexOf("NVD-CWE-") !== -1) {
                // NVD-CWE-Other and NVD-CWE-noinfo
                generated = generated + cveids[i];
            } else {
                if (nvd < jvn) {
                    // NVD
                    generated = generated + "<a href=\"" + detailLink.cwe_nvd.url + cveids[i].replace(/\[!!\]/, "").replace(/CWE-/, "") + "\" rel='noopener noreferrer' target='_blank'>" + cveids[i] + "</a>";
                } else {
                    // JVN
                    generated = generated + "<a href=\"" + detailLink.cwe_jvn.url + cveids[i].replace(/\[!!\]/, "") + ".html\" rel='noopener noreferrer' target='_blank'>" + cveids[i] + "</a>";
                }
            }
            if (i < cveids.length - 1) {
                generated = generated + ", ";
            }
        }
        $(this).text("").append(generated);
    });
};

const addAdvisoryIDLink = function() {
    let doms = $("#pivot_base").find("th:contains('CHK-advisoryid-')");
    doms.each(function() {
        let advisoryid = $(this).text().replace("CHK-advisoryid-", "");
        // Open Advisory page
        if (advisoryid.indexOf('ALAS2-') != -1) {
            // ALAS2
            $(this).text("").append("<a href=\"" + detailLink.amazon.url + "AL2/" + advisoryid.replace("ALAS2-", "ALAS-") + ".html\" rel='noopener noreferrer' target='_blank'>" + advisoryid + '</a>');
        } else if (advisoryid.indexOf('ALAS-') != -1) {
            // TODO ALAS
        }
        // TODO RHSA
        // TODO ELSA
        // TODO OVMSA
    });
};

const addCertLink = function() {
    let doms = $("#pivot_base").find("th:contains('CHK-CERT-')");
    doms.each(function() {
        let cert = $(this).text().replace("CHK-CERT-", "");
        let certs = cert.split(',');
        let generated = "";
        for (var i = 0; i < certs.length; i++) {
            let team = "USCERT";
            if (certs[i].indexOf("jpcert") != -1) {
                team = "JPCERT";
            }
            generated = generated +"<a href=\"" + certs[i] + "\" rel='noopener noreferrer' target='_blank'>" + team + "</a>";
            if (i < certs.length - 1) {
                generated = generated + "<br>";
            }
        }
        $(this).text("").append(generated);
    });
};

const addChangelogLink = function() {
    let doms = $("#pivot_base").find("th:contains('CHK-changelog-')");
    doms.each(function() {
        let changelogSearch = $(this).text().replace("CHK-changelog-", "").split(",");
        $(this).text("").append('<a href="#contents" class="lightbox" data-cveid="' + changelogSearch[0] + '" data-scantime="' + changelogSearch[1] + '" data-server="' + changelogSearch[2] + '" data-container="' + changelogSearch[3] + '" data-package="' + changelogSearch[4] + '">Changelog</a>');
    });
    addEventDisplayChangelog();
};

const createDetailData = function(cveID) {
    var targetObj = { cveContents: {} };
    targetObj["cweDict"] = {};
    $.each(vulsrepo.detailRawData, function(x, x_val) {
        tmpCve = x_val.data.scannedCves[cveID];
        if (tmpCve !== undefined) {
            targetObj["cveID"] = cveID;
            targetObj["DistroAdvisories"] = tmpCve.distroAdvisories;
            targetObj["exploits"] = tmpCve.exploits;
            targetObj["metasploits"] = tmpCve.metasploits;
            targetObj["alertDict"] = tmpCve.alertDict;
            $.each(vulsrepo.detailTaget, function(i, i_val) {
                if (tmpCve.cveContents !== undefined && tmpCve.cveContents[i_val] !== undefined) {
                    targetObj.cveContents[i_val] = tmpCve.cveContents[i_val];
                    // Make CWE information
                    if (targetObj.cveContents[i_val].cweIDs !== undefined) {
                        $.each(targetObj.cveContents[i_val].cweIDs, function(c, c_val) {
                            if (c_val.indexOf("NVD-CWE-") === -1) {
                                let cweid = c_val.split("-")[1];
                                let cweDict = x_val.data.cweDict[cweid];
                                if (targetObj.cweDict[cweid] === undefined) {
                                    targetObj.cweDict[cweid] = {};
                                }
                                if (targetObj.cweDict[cweid].en === undefined && cweDict.en !== undefined) {
                                    targetObj.cweDict[cweid].en = cweDict.en;
                                }
                                if (targetObj.cweDict[cweid].ja === undefined && cweDict.ja !== undefined) {
                                    targetObj.cweDict[cweid].ja = cweDict.ja;
                                }
                                targetObj.cweDict[cweid].owaspTopTen2017 = cweDict.owaspTopTen2017;
                                targetObj.cweDict[cweid].cweTopTwentyfive2019 = cweDict.cweTopTwentyfive2019;
                                targetObj.cweDict[cweid].sansTopTwentyfive = cweDict.sansTopTwentyfive;
                            }
                        });
                    }
                }
            });
        }
    });
    return targetObj;
};


const initDetail = function() {
    $("#modal-label").text("");
    $("#count-cert").text("0");
    $("#count-References").text("0");
    $("#CweID,#Mitigation,#Link,#cert,#exploit,#References").empty();
    $("#Mitigation-section").hide();
    $("#cert-section").hide();
    $("#exploit-section").hide();

    $.each(vulsrepo.detailTaget, function(i, i_val) {
        $("#typeName_" + i_val).empty();
        $("#typeName_" + i_val + "V3").empty();
        $("#scoreText_" + i_val).text("").removeClass();
        $("#scoreText_" + i_val + "V3").text("").removeClass();
        $("#summary_" + i_val).empty();
        $("#lastModified_" + i_val).empty();
    });
};


const displayDetail = function(cveID) {
    initDetail();
    let data = createDetailData(cveID);

    // ---CVSS Detail
    $("#modal-label").text(data.cveID);

    let dispCvss = function(target) {
        let dest = target;
        if (target === "redhat_api") {
            dest = "redhat"
        }

        if (data.cveContents[target] !== undefined) {
            scoreV2 = data.cveContents[target].cvss2Score;
            scoreV3 = data.cveContents[target].cvss3Score;

            if (scoreV2 !== 0) {
                severityV2 = toUpperFirstLetter(data.cveContents[target].cvss2Severity);
            }
            if (scoreV3 !== 0) {
                severityV3 = toUpperFirstLetter(data.cveContents[target].cvss3Severity);
            }

            if (scoreV2 !== 0) {
                $("#scoreText_" + dest).removeClass();
                $("#scoreText_" + dest).text(scoreV2.toFixed(1) + " (" + severityV2 + ")").addClass("cvss-" + severityV2);
            } else {
                $("#scoreText_" + dest).removeClass();
                $("#scoreText_" + dest).text("None").addClass("cvss-None");
            }

            if (scoreV3 !== 0) {
                $("#scoreText_" + dest + "V3").removeClass();
                $("#scoreText_" + dest + "V3").text(scoreV3.toFixed(1) + " (" + severityV3 + ")").addClass("cvss-" + severityV3);
            } else {
                $("#scoreText_" + dest + "V3").removeClass();
                $("#scoreText_" + dest + "V3").text("None").addClass("cvss-None");
            }

            if (target === "ubuntu" || target === "debian" || target === "debian_security_tracker" || target === "amazon") {
                $("#scoreText_" + dest).removeClass();
                $("#scoreText_" + dest).text(severityV2).addClass("cvss-" + severityV2);
            }

            if (data.cveContents[target].Summary !== "") {
                if ($("#summary_" + dest).text() === "NO DATA" || $("#summary_" + dest).text() === "") {
                    $("#summary_" + dest).text("");
                    $("#summary_" + dest).append("<div>" + data.cveContents[target].summary + "</div>");
                }
            }

            if (data.cveContents[target].lastModified !== "0001-01-01T00:00:00Z") {
                $("#lastModified_" + dest).text(data.cveContents[target].lastModified.split("T")[0]);
            } else {
                $("#lastModified_" + dest).text("------");
                $("#lastModified_" + dest + "V3").text("------");
            }

            // ---Mitigation---
            if (data.cveContents[target].mitigation !== undefined && data.cveContents[target].mitigation !== "") {
                $("#Mitigation").append("<div><strong>=== " + target + " ===</strong></div>");
                $("#Mitigation").append("<pre>" + data.cveContents[target].mitigation + "</pre>");
                $("#Mitigation-section").show();
            }

            var resultV2 = [];
            if (data.cveContents[target].cvss2Vector !== "") {
                var arrayVectorV2 = getSplitArray(data.cveContents[target].cvss2Vector);
                resultV2.push(getVectorV2.cvss(arrayVectorV2[0])[1]);
                resultV2.push(getVectorV2.cvss(arrayVectorV2[1])[1]);
                resultV2.push(getVectorV2.cvss(arrayVectorV2[2])[1]);
                resultV2.push(getVectorV2.cvss(arrayVectorV2[3])[1]);
                resultV2.push(getVectorV2.cvss(arrayVectorV2[4])[1]);
                resultV2.push(getVectorV2.cvss(arrayVectorV2[5])[1]);
            }

            var resultV3 = [];
            if (data.cveContents[target].cvss3Vector !== "") {
                var arrayVectorV3 = getSplitArray(data.cveContents[target].cvss3Vector);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[1], "")[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[2], "")[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[3], arrayVectorV3[5])[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[4], "")[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[5], "")[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[6], "")[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[7], "")[1]);
                resultV3.push(getVectorV3.cvss(arrayVectorV3[8], "")[1]);
            }

        } else {
            $("#scoreText_" + dest).text("None").addClass("cvss-None");
            $("#scoreText_" + dest + "V3").text("None").addClass("cvss-None");
            $("#summary_" + dest).text("NO DATA");
            $("#summary_" + dest + "V3").text("NO DATA");
            $("#lastModified_" + dest).text("------");
            $("#lastModified_" + dest + "V3").text("------");
        }

        if (resultV2 === undefined) {
            resultV2 = [0, 0, 0, 0, 0, 0];
        }

        if (resultV3 === undefined) {
            resultV3 = [0, 0, 0, 0, 0, 0, 0, 0];
        }

        return [resultV2, resultV3];
    }

    // ---ChartRadar
    let radarData_nvd
    let radarData_nvdV3
    let radarData_jvn
    let radarData_jvnV3
    let radarData_redhatV2
    let radarData_redhatV3

    $.each(vulsrepo.detailTaget, function(i, i_val) {
        let r = dispCvss(i_val);
        switch (i_val) {
            case "nvd":
                radarData_nvd = r[0];
                radarData_nvdV3 = r[1];
                break;
            case "jvn":
                radarData_jvn = r[0];
                radarData_jvnV3 = r[1];
                break;
            case "redhat_api":
            case "redhat":
                radarData_redhatV2 = r[0];
                radarData_redhatV3 = r[1];
                break;
        }

    });

    var ctxV2 = document.getElementById("radar-chartV2");
    var ctxV3 = document.getElementById("radar-chartV3");

    if (typeof chartV2 != "undefined") {
        chartV2.destroy();
    }
    if (typeof chartV3 != "undefined") {
        chartV3.destroy();
    }

    chartV2 = new Chart(ctxV2, {
        type: 'radar',
        options: {
            responsive: false,
            scale: {
                ticks: {
                    beginAtZero: true,
                    stepSize: 1
                }
            }
        },
        data: {
            labels: ["Access Vector(AV)", "Access Complexity(AC)", "Authentication(Au)", "Confidentiality Impact(C)", "Integrity Impact(I)", "Availability Impact(A)"],
            datasets: [{
                    label: "NVD",
                    backgroundColor: "rgba(179,181,198,0.2)",
                    borderColor: "rgba(179,181,198,1)",
                    pointBackgroundColor: "rgba(179,181,198,1)",
                    pointBorderColor: "#fff",
                    pointHoverBackgroundColor: "#fff",
                    pointHoverBorderColor: "rgba(179,181,198,1)",
                    hitRadius: 5,
                    data: radarData_nvd
                },
                {
                    label: "JVN",
                    backgroundColor: "rgba(255,99,132,0.2)",
                    borderColor: "rgba(255,99,132,1)",
                    pointBackgroundColor: "rgba(255,99,132,1)",
                    pointBorderColor: "#fff",
                    pointHoverBackgroundColor: "#fff",
                    pointHoverBorderColor: "rgba(255,99,132,1)",
                    hitRadius: 5,
                    data: radarData_jvn
                },
                {
                    label: "RedHatV2",
                    backgroundColor: "rgba(51,204,204,0.2)",
                    borderColor: "rgba(51,204,204,1)",
                    pointBackgroundColor: "rgba(51,204,204,1)",
                    pointBorderColor: "#fff",
                    pointHoverBackgroundColor: "#fff",
                    pointHoverBorderColor: "rgba(51,204,204,1)",
                    hitRadius: 5,
                    data: radarData_redhatV2
                }
            ]
        }
    });

    chartV3 = new Chart(ctxV3, {
        type: 'radar',
        options: {
            responsive: false,
            scale: {
                ticks: {
                    beginAtZero: true,
                    stepSize: 1
                }
            }
        },
        data: {
            labels: ["Access Vector(AV)", "Access Complexity(AC)", "Privileges Required(PR)", "User Interaction(UI)", "Scope(S)", "Confidentiality Impact(C)", "Integrity Impact(I)", "Availability Impact(A)"],
            datasets: [{
                label: "NVD v3",
                backgroundColor: "rgba(179,181,198,0.2)",
                borderColor: "rgba(179,181,198,1)",
                pointBackgroundColor: "rgba(179,181,198,1)",
                pointBorderColor: "#fff",
                pointHoverBackgroundColor: "#fff",
                pointHoverBorderColor: "rgba(179,181,198,1)",
                hitRadius: 5,
                data: radarData_nvdV3
                },
                {
                label: "JVN v3",
                backgroundColor: "rgba(255,99,132,0.2)",
                borderColor: "rgba(255,99,132,1)",
                pointBackgroundColor: "rgba(255,99,132,1)",
                pointBorderColor: "#fff",
                pointHoverBackgroundColor: "#fff",
                pointHoverBorderColor: "rgba(255,99,132,1)",
                hitRadius: 5,
                data: radarData_jvnV3
                },
                {
                label: "RedHatV3",
                backgroundColor: "rgba(102,102,255,0.2)",
                borderColor: "rgba(102,102,255,1)",
                pointBackgroundColor: "rgba(102,102,255,1)",
                pointBorderColor: "#fff",
                pointHoverBackgroundColor: "#fff",
                pointHoverBorderColor: "rgba(102,102,255,1)",
                hitRadius: 5,
                data: radarData_redhatV3

            }]
        }
    });

    // --collapse
    // $("#summary_redhat").collapser('reInit');
    $('#summary_redhat > div').collapser({
        mode: 'words',
        truncate: 100
    });

    $('#summary_amazon > div').collapser({
        mode: 'words',
        truncate: 50
    });

    const prioltyFlag = db.get("vulsrepo_pivotPriority");
    let nvd = prioltyFlag.indexOf("nvd");
    let jvn = prioltyFlag.indexOf("jvn");

    // ---CweID---
    let getCweIDInfo = function(cveContents, target) {
        if (cveContents[target] !== undefined) {
            if (cveContents[target].cweIDs) {
                $("#CweID").append("<div><strong>=== " + target + " ===</strong></div>");
                $("#CweID").append("<ul id='cwe-" + target + "'>");
                $.each(cveContents[target].cweIDs, function(x, x_val) {
                    let cweid = x_val.split("-")[1];
                    if (data.cweDict[cweid] !== undefined) {
                        $("#cwe-" + target).append("<li id='cweid-" + cweid + "-" + target + "'>");
                        let name = "";
                        if (nvd < jvn) {
                            if (data.cweDict[cweid].en !== undefined) {
                                name = data.cweDict[cweid].en.name;
                            } else if (name === "" && data.cweDict[cweid].ja !== undefined) {
                                name = data.cweDict[cweid].ja.name;
                            }
                        } else {
                            if (data.cweDict[cweid].ja !== undefined) {
                                name = data.cweDict[cweid].ja.name;
                            } else  if (name === "" && data.cweDict[cweid].en !== undefined) {
                                name = data.cweDict[cweid].en.name;
                            }
                        }
                        $("#cweid-" + cweid + "-" + target).append(cweid + " [" + name + "]");
                        $("#cweid-" + cweid + "-" + target).append(" (<a href=\"" + detailLink.cwe_nvd.url + cweid + "\" rel='noopener noreferrer' target='_blank'>MITRE</a>");
                        $("#cweid-" + cweid + "-" + target).append("<span>&nbsp;/&nbsp;</span>");
                        $("#cweid-" + cweid + "-" + target).append("<a href=\"" + detailLink.cwe_jvn.url + x_val + ".html\" rel='noopener noreferrer' target='_blank'>JVN</a>)");
                        if (data.cweDict[cweid].cweTopTwentyfive2019 !== "") {
                            // CWE Top25 https://cwe.mitre.org/top25/archive/2019/2019_cwe_top25.html
                            $("#cweid-" + cweid + "-" + target).append(" <a href=\"" + detailLink.cweTopTwentyfive2019.url + "\" rel='noopener noreferrer' target='_blank' class='badge count'>CWE Rank: " + data.cweDict[cweid].cweTopTwentyfive2019 +"</a>");
                        }
                        if (data.cweDict[cweid].owaspTopTen2017 !== "") {
                            // OWASP Top Ten 2017 https://owasp.org/www-project-top-ten/OWASP_Top_Ten_2017/Top_10-2017_Top_10.html
                            let owaspLink = "";
                            if (nvd < jvn) {
                                owaspLink = detailLink.owaspTopTen2017[data.cweDict[cweid].owaspTopTen2017].en;
                            } else {
                                owaspLink = detailLink.owaspTopTen2017[data.cweDict[cweid].owaspTopTen2017].ja;
                            }
                            $("#cweid-" + cweid + "-" + target).append(" <a href=\"" + owaspLink + "\" rel='noopener noreferrer' target='_blank' class='badge count'>OWASP Rank: " + data.cweDict[cweid].owaspTopTen2017 +"</a>");
                        }
                        if (data.cweDict[cweid].sansTopTwentyfive !== "") {
                            // SANS Top25 https://www.sans.org/top25-software-errors/
                            $("#cweid-" + cweid + "-" + target).append(" <a href=\"" + detailLink.sansTopTwentyfive.url + "\" rel='noopener noreferrer' target='_blank' class='badge count'>SANS Rank: " + data.cweDict[cweid].sansTopTwentyfive + "</a>");
                        }
                        $("#cwe-" + target).append("</li>");
                    }
                });
                $("#CweID").append("</ul>");
            }
        }
        return;
    };

    getCweIDInfo(data.cveContents, "nvd");
    getCweIDInfo(data.cveContents, "redhat");
    getCweIDInfo(data.cveContents, "redhat_api");

    // ---Link---
    var addLink = function(target, url, disp) {
        $(target).append("<a href=\"" + url + "\" rel='noopener noreferrer' target='_blank'>" + disp + " </a>");
    };

    addLink("#Link", detailLink.mitre.url + "?name=" + data.cveID, detailLink.mitre.disp);
    $("#Link").append("<span> / </span>");
    addLink("#Link", detailLink.cveDetail.url + data.cveID, detailLink.cveDetail.disp);
    $("#Link").append("<span> / </span>");
    addLink("#Link", detailLink.cvssV2Calculator.url + data.cveID, detailLink.cvssV2Calculator.disp);
    $("#Link").append("<span> / </span>");
    addLink("#Link", detailLink.cvssV3Calculator.url + data.cveID, detailLink.cvssV3Calculator.disp);
    if (data.cveContents.jvn  !== undefined && data.cveContents.jvn.cvss3Vector !== undefined) {
        $("#Link").append("<span> / </span>");
        addLink("#Link", detailLink.cvssV3CalculatorJvn.url + "#" + data.cveContents.jvn.cvss3Vector, detailLink.cvssV3CalculatorJvn.disp);
    }
    $.each(getDistroAdvisoriesArray(data.DistroAdvisories), function(i, i_val) {
        $("#Link").append("<span> / </span>");
        addLink("#Link", i_val.url, i_val.disp);
    });

    addLink("#typeName_nvd", detailLink.nvd.url + data.cveID, detailLink.nvd.disp + " (v2)");
    addLink("#typeName_nvdV3", detailLink.nvd.url + data.cveID, detailLink.nvd.disp + " (v3)");
    if (data.cveContents.jvn !== undefined) {
        if (data.cveContents.jvn.jvnLink === "") {
            $("#typeName_jvn").append("<a href=\"" + detailLink.jvn.url + data.cveID + "\" rel='noopener noreferrer' target='_blank'>JVN (v2)</a>");
            $("#typeName_jvnV3").append("<a href=\"" + detailLink.jvn.url + data.cveID + "\" rel='noopener noreferrer' target='_blank'>JVN (v3)</a>");
        } else {
            $("#typeName_jvn").append("<a href=\"" + data.cveContents.jvn.sourceLink + "\" rel='noopener noreferrer' target='_blank'>JVN (v2)</a>");
            $("#typeName_jvnV3").append("<a href=\"" + data.cveContents.jvn.sourceLink + "\" rel='noopener noreferrer' target='_blank'>JVN (v3)</a>");
        }
    } else {
        $("#typeName_jvn").append("<a href=\"" + detailLink.jvn.url + data.cveID + "\" rel='noopener noreferrer' target='_blank'>JVN (v2)</a>");
        $("#typeName_jvnV3").append("<a href=\"" + detailLink.jvn.url + data.cveID + "\" rel='noopener noreferrer' target='_blank'>JVN (v3)</a>");
    }
    addLink("#typeName_redhat", detailLink.rhel.url + data.cveID, "RedHat (v2)");
    addLink("#typeName_redhatV3", detailLink.rhel.url + data.cveID, "RedHat (v3)");
    addLink("#typeName_ubuntu", detailLink.ubuntu.url + data.cveID, detailLink.ubuntu.disp);
    addLink("#typeName_debian", detailLink.debian.url + data.cveID, detailLink.debian.disp);
    addLink("#typeName_oracle", detailLink.oracle.url + data.cveID + ".html", detailLink.oracle.disp);
    if (data.cveContents.amazon !== undefined) {
        if (data.cveContents.amazon.title.indexOf('ALAS2-') != -1) {
            $("#typeName_amazon").append("<a href=\"" + detailLink.amazon.url + "AL2/" + data.cveContents.amazon.title.replace("ALAS2-", "ALAS-") + ".html\" rel='noopener noreferrer' target='_blank'>Amazon</a>");
        } else {
            // TODO Amazon Linux 1
        }
    } else {
        $("#typeName_amazon").append("Amazon");
    }

    // ---USCERT/JPCERT---
    let countCert = 0;

    var addCert = function(target, cert) {
        if (data.alertDict[target] !== undefined) {
            if (isCheckNull(data.alertDict[target]) === false) {
                $("#cert").append("<div><strong>=== " + cert + " Alert ===</strong></div>");
                let certId = cert + "-cert-list";
                $("#cert").append("<ul id='" + certId + "'>");
                $.each(data.alertDict[target], function(x, x_val) {
                    let title = cert;
                    if (x_val.title !== undefined) {
                        title = x_val.title;
                    }
                    $("#" + certId).append("<li>[" + title + "]<a href=\"" + x_val.url + "\" rel='noopener noreferrer' target='_blank'> (" + x_val.url + ")</a></li>");
                    countCert++;
                });
                $("#cert").append("</ul>");
            }
        }
    }
    if (nvd < jvn) {
        addCert("en", "USCERT");
        addCert("ja", "JPCERT");
    } else {
        addCert("ja", "JPCERT");
        addCert("en", "USCERT");
    }
    if (countCert > 0) {
        $("#count-cert").text(countCert);
        $("#cert-section").show();
    }

    // ---Exploits---
    let countExploit = 0;

    var addExploit = function() {
        if (data.exploits !== undefined) {
            $("#exploit").append("<div><strong>=== Exploit Codes ===</strong></div>");
            $("#exploit").append("<ul id='exploit-list'>");
            $.each(data.exploits, function(x, x_val) {
                $("#exploit-list").append("<li>[" + x_val.exploitType + "]<a href=\"" + x_val.url + "\" rel='noopener noreferrer' target='_blank'> (" + x_val.url + ")</a> " + x_val.description + "</li>");
                countExploit++;
            });
            $("#exploit").append("</ul>");
        }

        if (data.metasploits !== undefined) {
            $("#exploit").append("<div><strong>=== Metasploit Modules ===</strong></div>");
            $("#exploit").append("<ul id='metasploit-list'>");
            $.each(data.metasploits, function(x, x_val) {
                let exploitId = "exploit-" + countExploit;
                $("#metasploit-list").append("<li id='" + exploitId + "'>");
                // name, title
                $("#" + exploitId).append("<div>[" + x_val.name + "] " + x_val.title);
                // description
                $("#" + exploitId).append("<span class='metasploits-description'>" + x_val.description + "</span>");
                // URLs
                $("#" + exploitId).append("<ul id='"+ exploitId + "-inner-list'>");
                $.each(x_val.URLs, function(u, u_val) {
                    $("#" + exploitId +"-inner-list").append("<li><a href=\"" + u_val + "\" rel='noopener noreferrer' target='_blank'>" + u_val + "</a></li>");
                    countExploit++;
                });
                $("#" + exploitId).append("</ul>");
                $("#" + exploitId).append("</div>");
                $("#metasploit-list").append("</li>");
            });
            $("#exploit").append("</ul>");
        }
    }
    addExploit();
    $('span.metasploits-description').collapser({
        mode: 'words',
        truncate: 50
    });
    if (countExploit > 0) {
        $("#count-exploit").text(countExploit);
        $("#exploit-section").show();
    }

    // ---References---
    let countRef = 0;

    var addRef = function(target) {
        if (data.cveContents[target] !== undefined) {
            if (isCheckNull(data.cveContents[target].references) === false) {
                $("#References").append("<div><strong>=== " + target + " ===</strong></div>");
                let referencesId = target + "-references-list";
                $("#References").append("<ul id='"+ referencesId + "'>");
                $.each(data.cveContents[target].references, function(x, x_val) {
                    $("#" + referencesId).append("<li>[" + x_val.source + "]<a href=\"" + x_val.link + "\" rel='noopener noreferrer' target='_blank'> (" + x_val.link + ")</a></li>");
                    countRef++;
                });
                $("#References").append("</ul>");
            }
        }
    }

    $.each(prioltyFlag, function(i, i_val) {
        addRef(i_val);
    });

    $("#count-References").text(countRef);

    // ---Tab Package
    var pkgData = createDetailPackageData(cveID);
    packageTable.destroy();

    packageTable.on( 'draw', function () {
        $("#table-package").find("td:contains('Fixed')").removeClass("notfixyet-true").addClass("notfixyet-false");
        $("#table-package").find("td:contains('Unfixed')").removeClass("notfixyet-false").addClass("notfixyet-true");

        // ---package changelog event
        addEventDisplayChangelog();
    } );

    packageTable = $("#table-package")
        .DataTable({
            "data": pkgData,
            "fixedHeader": true,
            "retrieve": true,
            "scrollX": true,
            "autoWidth": true,
            "scrollCollapse": true,
            "columns": [{
                data: "ScanTime"
            }, {
                data: "ServerName"
            }, {
                data: "ContainerName"
            }, {
                data: "PackageName"
            }, {
                data: "PackageVersion"
            }, {
                data: "PackageRelease"
            }, {
                data: "PackageNewVersion"
            }, {
                data: "PackageNewRelease"
            }, {
                data: "Repository"
            }, {
                data: "FixedIn"
            }, {
                data: "FixState"
            }, {
                data: "NotFixedYet"
            }]
        });

    $("#modal-detail").modal('show');
    setTimeout(function() { packageTable.columns.adjust(); }, 200);



};

const getDistroAdvisoriesArray = function(DistroAdvisoriesData) {
    let distroAdvisoriesArray = [];
    $.each(DistroAdvisoriesData, function(x, x_val) {
        let tmp_Map = {};
        if (x_val.advisoryID.indexOf("ALAS-") != -1) {
            tmp_Map = {
                url: detailLink.amazon.url + x_val.advisoryID + ".html",
                disp: detailLink.amazon.disp,
            }
        } else if (x_val.advisoryID.indexOf("ALAS2-") != -1) {
            tmp_Map = {
                url: detailLink.amazon.url + "AL2/" + x_val.advisoryID.replace("ALAS2-", "ALAS-") + ".html",
                disp: detailLink.amazon.disp,
            }
        } else if (x_val.advisoryID.indexOf("RHSA-") != -1) {
            tmp_Map = {
                url: detailLink.rhn.url + x_val.advisoryID + ".html",
                disp: detailLink.rhn.disp,
            }
        } else if ((x_val.advisoryID.indexOf("ELSA-") != -1) | (x_val.advisoryID.indexOf("OVMSA-") != -1)) {
            tmp_Map = {
                url: detailLink.oracleErrata.url + x_val.advisoryID + ".html",
                disp: detailLink.oracleErrata.disp,
            }
        } else {
            // For cases where other distros are increased
            console.log("");
        }
        distroAdvisoriesArray.push(tmp_Map);
    });
    return distroAdvisoriesArray;
};

var scrollTop;
const addEventDisplayChangelog = function() {
    $('.lightbox').colorbox({
        inline: true,
        href: "#changelog-content",
        width: "950px",
        height: "90%",
        speed: 100,
        fadeOut: 100,
        opacity: 0.2,
        closeButton: false,
        onComplete: function() {
            displayChangelogDetail(this);
            scrollTop = $(window).scrollTop();
            $('body').addClass('noscroll').css('top', (-scrollTop) + 'px');
        },
        onClosed: function() {
            $('body').removeClass('noscroll');
            $(window).scrollTop(scrollTop);
        }
    });
}

const createDetailPackageData = function(cveID) {
    var array = [];
    $.each(vulsrepo.detailRawData, function(x, x_val) {
        $.each(x_val.data.scannedCves, function(y, y_val) {
            if (cveID === y_val.cveID) {
                if (isCheckNull(y_val.cpeNames) === false) {
                    targets = y_val.cpeNames;
                } else if(isCheckNull(y_val.cpeURIs) === false) {
                    targets = y_val.cpeURIs;
                } else {
                    targets = y_val.affectedPackages;
                }

                $.each(targets, function(z, z_val) {
                    if (z_val.name === undefined) {
                        pkgName = z_val;
                        NotFixedYet = "None";
                    } else {
                        pkgName = z_val.name;
                        NotFixedYet = isNotFixedYet(z_val);
                        fixedIn = getFixedIn(z_val);
                        fixState = getFixState(z_val);
                    }

                    let tmp_Map = {
                        ScanTime: x_val.scanTime,
                        ServerName: x_val.data.serverName,
                        ContainerName: x_val.data.container.name,
                    };

                    if (pkgName.indexOf('cpe:/') != -1) {
                        tmp_Map["PackageName"] = '<a href="#contents" class="lightbox" data-cveid="' + cveID + '" data-scantime="' + x_val.scanTime + '" data-server="' + x_val.data.serverName + '" data-container="' + x_val.data.container.name + '" data-package="' + pkgName + '">' + pkgName + '</a>';
                        tmp_Map["PackageVersion"] = "";
                        tmp_Map["PackageRelease"] = "";
                        tmp_Map["PackageNewVersion"] = "";
                        tmp_Map["PackageNewRelease"] = "";
                        tmp_Map["Repository"] = "";
                        tmp_Map["NotFixedYet"] = "";
                        tmp_Map["FixedIn"] = "";
                        tmp_Map["FixState"] = "";
                    } else if (x_val.data.packages[pkgName] !== undefined) {
                        tmp_Map["PackageName"] = '<a href="#contents" class="lightbox" data-cveid="' + cveID + '" data-scantime="' + x_val.scanTime + '" data-server="' + x_val.data.serverName + '" data-container="' + x_val.data.container.name + '" data-package="' + pkgName + '">' + pkgName + '</a>';
                        tmp_Map["PackageVersion"] = x_val.data.packages[pkgName].version;
                        tmp_Map["PackageRelease"] = x_val.data.packages[pkgName].release;
                        tmp_Map["PackageNewVersion"] = x_val.data.packages[pkgName].newVersion;
                        tmp_Map["PackageNewRelease"] = x_val.data.packages[pkgName].newRelease;
                        tmp_Map["Repository"] = x_val.data.packages[pkgName].repository;
                        tmp_Map["NotFixedYet"] = NotFixedYet;
                        tmp_Map["FixedIn"] = fixedIn;
                        tmp_Map["FixState"] = fixState;
                    } else {
                        return;
                    }

                    array.push(tmp_Map);
                });
            }
        });
    });
    return array;
};

const displayChangelogDetail = function(ankerData) {
    let scantime = $(ankerData).attr('data-scantime');
    let server = $(ankerData).attr('data-server');
    let container = $(ankerData).attr('data-container');
    let cveid = $(ankerData).attr('data-cveid');
    let package = $(ankerData).attr('data-package');
    let changelogInfo = getChangeLogInfo(scantime, server, container, cveid, package);

    $("#changelog-cveid, #changelog-servername, #changelog-containername, #changelog-packagename, #changelog-method, #changelog-score, #changelog-contents, #changelog-notfixedyet").empty();
    $("#changelog-cveid").append(cveid);
    $("#changelog-servername").append(server);
    $("#changelog-containername").append(container);
    $("#changelog-method").append(changelogInfo.cveidInfo.confidences[0].detectionMethod);
    $("#changelog-score").append(changelogInfo.cveidInfo.confidences[0].score);

    let getPkg = function() {
        let result;
        $.each(changelogInfo.cveidInfo.affectedPackages, function (i, i_val) {
            if (i_val.name === package) {
                result = i_val;
            };
        });
        return result;
    };

    let pkg = getPkg();
    let notFixedYet = isNotFixedYet(pkg);
    if (notFixedYet === "Unfixed") {
        $("#changelog-notfixedyet").append("Unfixed").removeClass("notfixyet-false").addClass("notfixyet-true");
    } else if (notFixedYet === "Fixed") {
        $("#changelog-notfixedyet").append("Fixed").removeClass("notfixyet-true").addClass("notfixyet-false");
    }
    let fixedIn = getFixedIn(pkg);
    let fixState = getFixState(pkg);

    if (isCheckNull(changelogInfo.pkgContents) !== true) {
        var packageInfo = pkgContents.name + "-" + pkgContents.version;
        if (pkgContents.release !== "") {
            packageInfo = packageInfo + "." + pkgContents.release;
        }
        let to = pkgContents.newVersion;
        if (pkgContents.newRelease !== "") {
            to = to + "." + pkgContents.newRelease;
        }
        if (notFixedYet === "Unfixed") {
            if (fixState !== "") {
                to = fixState;
            } else {
                to = "Not Fixed Yet";
            }
        } else if (to === "") {
            to = "Unknown";
        }
        if (fixedIn !== "") {
            to = to + "<br> (FixedIn: " + fixedIn + ")";
        }

        packageInfo = packageInfo + " => " + to;
        if (pkgContents.repository !== "") {
            packageInfo = packageInfo + " (" + pkgContents.repository + ")";
        }
        $("#changelog-packagename").append(packageInfo);
        if (changelogInfo.pkgContents.changelog.contents === "") {
            $("#changelog-contents").append("NO DATA");
        } else {
            $.each(shapeChangelog(changelogInfo.pkgContents.changelog.contents, cveid), function (y, y_val) {
                if (y_val === "") {
                    $("#changelog-contents").append("<br>");
                } else {
                    $("#changelog-contents").append("<div>" + y_val + "</div>");
                }
            });
        }
    } else {
        $("#changelog-packagename").append(package);
        $("#changelog-contents").append("NO DATA");
    }
}

const getChangeLogInfo = function(scantime, server, container, cveid, package) {
    let cveidInfo;
    let changelogContents = "";
    $.each(vulsrepo.detailRawData, function(x, x_val) {
        if ((x_val.scanTime === scantime) && (x_val.data.serverName === server) && (x_val.data.container.name === container)) {
            $.each(x_val.data.scannedCves, function(y, y_val) {
                if (y_val.cveID === cveid) {
                    cveidInfo = y_val;
                }
            });
            pkgContents = x_val.data.packages[package];
        }
    });
    return { "cveidInfo": cveidInfo, "pkgContents": pkgContents };
};


const shapeChangelog = function(changelogContents, cveid) {
    let tmpArray = changelogContents.split("\n");
    let resultArray = [];
    let regExpTarget = new RegExp('<span class="changelog-allcveid">' + cveid + '</span>', "g");

    $.each(tmpArray, function(x, x_val) {
        let line = _.escape(x_val)
            .replace(/\s/g, "&nbsp;")
            .replace(/^(\*.+)$/g, '<span class="changelog-title">$1</span>') //for centos
            .replace(/^([a-zA-Z].+urgency=.+)$/g, '<span class="changelog-title">$1</span>') //for debian ubuntu
            .replace(/(CVE-[0-9]{4}-[0-9]+)/g, '<span class="changelog-allcveid">$1</span>')
            .replace(regExpTarget, '<span class="changelog-targetcveid">' + cveid + '</span>');

        resultArray.push(line);
    })

    return resultArray;
}

const bringToFlont = function(id) {
    var v = $('#' + id);
    v.appendTo(v.parent());
}

const toUpperFirstLetter = function(str) {
    return str.charAt(0).toUpperCase() + str.substring(1).toLowerCase();
}
